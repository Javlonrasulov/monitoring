"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { isLoggedIn, login } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function LoginPage() {
  const router = useRouter();
  const { t } = useI18n();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isLoggedIn()) {
      router.replace("/devices");
    }
  }, [router]);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await login(email.trim(), password);
      router.replace("/devices");
    } catch (err) {
      setError(err instanceof Error ? err.message : t("loginFailed"));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-page">
      <div className="login-card">
        <div className="login-card-top">
          <h1 className="login-brand">{t("brandName")}</h1>
          <LanguageSwitcher />
        </div>
        <p className="muted" style={{ marginTop: 0, marginBottom: "1.25rem" }}>
          {t("loginSubtitle")}
        </p>

        <form className="form-stack" onSubmit={handleSubmit}>
          <label className="field">
            <span>{t("loginEmail")}</span>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </label>

          <label className="field">
            <span>{t("loginPassword")}</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>

          {error && <p className="form-error">{error}</p>}

          <button type="submit" className="btn btn-primary" disabled={loading}>
            {loading ? t("loginSubmitting") : t("loginSubmit")}
          </button>
        </form>
      </div>
    </div>
  );
}
