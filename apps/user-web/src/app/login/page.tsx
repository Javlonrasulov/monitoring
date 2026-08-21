"use client";

import { FormEvent, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Download, Eye, EyeOff } from "lucide-react";
import { isPaired, savePairSession } from "@/lib/auth";
import { ApiError } from "@/lib/api";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

const APK_DOWNLOAD_URL = "/download/monitor.apk?v=1.2.0";

/**
 * Login UX mirrors Android PairingScreen exactly:
 * - Phone + password always
 * - Name + link code only when NOT a returning (registered) account
 * - Returning account: knownAccount === true → hide name and code
 */
function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useI18n();
  const toast = useToast();

  const inviteFromUrl = (params.get("code") || "")
    .replace(/^MONITOR:/i, "")
    .replace(/\s+/g, "")
    .toUpperCase();

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [passwordVisible, setPasswordVisible] = useState(false);
  const [displayName, setDisplayName] = useState("");
  const [code, setCode] = useState(inviteFromUrl);
  const [knownAccount, setKnownAccount] = useState<boolean | null>(null);
  const [trialBlocked, setTrialBlocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const phoneDigits = phone.replace(/\D/g, "");
  const pinOk = password.length >= 4 && /^\d+$/.test(password);
  // Android: returningUser = knownAccount == true
  const returningUser = knownAccount === true;
  // Android: name + code visible when !returningUser
  const showNameAndCode = !returningUser;

  const canSubmit = useMemo(() => {
    if (busy || phoneDigits.length < 9 || !pinOk) return false;
    // Android: returningUser || (displayName.isNotBlank() && !trialBlocked)
    if (returningUser) return true;
    return displayName.trim().length > 0 && !trialBlocked;
  }, [busy, phoneDigits, pinOk, returningUser, displayName, trialBlocked]);

  useEffect(() => {
    if (isPaired()) router.replace("/chats");
  }, [router]);

  // Android LaunchedEffect(phoneDigits): pair-status → knownAccount
  useEffect(() => {
    if (phoneDigits.length < 9) {
      setKnownAccount(null);
      setTrialBlocked(false);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(() => {
      deviceApi
        .pairStatus(phone.trim() || phoneDigits)
        .then((status) => {
          if (cancelled) return;
          setKnownAccount(status.exists);
          if (status.exists) {
            // Registered: never ask name or share code again
            setCode("");
            setDisplayName("");
            setTrialBlocked(false);
            setError(null);
            return;
          }
          const blocked = Boolean(status.trialBlocked) && !status.exists;
          setTrialBlocked(blocked);
          if (blocked) {
            const existing = (status.existingPhone || "").replace(/\D/g, "");
            if (existing.length >= 9 && existing !== phoneDigits) {
              setPhone(existing);
              setDisplayName("");
              setCode("");
              return;
            }
            const label = (status.existingPhone || "").replace(/\D/g, "");
            if (status.trialEnded) {
              setError(
                label.length >= 9
                  ? t("pairTrialEnded").replace("{phone}", label)
                  : t("pairTrialEndedGeneric"),
              );
            } else {
              setError(
                label.length >= 9
                  ? t("pairTrialUsed").replace("{phone}", label)
                  : t("pairTrialUsedGeneric"),
              );
            }
          }
        })
        .catch(() => {
          if (!cancelled) {
            setKnownAccount(null);
            setTrialBlocked(false);
          }
        });
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [phone, phoneDigits, t]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setError(null);

    setBusy(true);
    try {
      const cleanedCode = returningUser
        ? ""
        : code
            .replace(/^MONITOR:/i, "")
            .replace(/\s+/g, "")
            .trim()
            .toUpperCase();

      const res = await deviceApi.pair({
        phone: phone.trim() || phoneDigits,
        password,
        // Android: name/code empty for returning users
        name: returningUser ? "" : displayName.trim(),
        code: cleanedCode,
        appVersion: "user-web/0.1.0",
        deviceModel:
          typeof navigator !== "undefined"
            ? navigator.userAgent.slice(0, 80)
            : "web",
      });
      savePairSession(res);
      toast.push(t("login"), "ok");
      router.replace("/chats");
    } catch (err) {
      let msg = err instanceof ApiError ? err.message : t("pairFailed");
      if (/trial ended/i.test(msg)) {
        const m = msg.match(/Sign in as\s+(\+?\d{9,})/i);
        msg = m?.[1]
          ? t("pairTrialEnded").replace("{phone}", m[1])
          : t("pairTrialEndedGeneric");
      } else if (/free trial already used/i.test(msg)) {
        const m = msg.match(/Sign in as\s+(\+?\d{9,})/i);
        if (m?.[1]) {
          setPhone(m[1].replace(/\D/g, ""));
          msg = t("pairTrialUsed").replace("{phone}", m[1]);
        } else {
          msg = t("pairTrialUsedGeneric");
        }
      } else if (/invalid password/i.test(msg)) msg = t("pairPasswordWrong");
      else if (/at least 4 digits/i.test(msg)) msg = t("pairPasswordInvalid");
      else if (/invalid pairing|invalid.*code|already used/i.test(msg)) {
        msg = t("pairInvalidCode");
      } else if (/name is required/i.test(msg)) msg = t("pairNameRequired");
      setError(msg);
      // One toast at the top — do not stack duplicates on repeat submits.
      toast.push(msg, "err");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="auth-page">
      <form className="auth-card stack" onSubmit={onSubmit}>
        <a
          className="auth-download"
          href={APK_DOWNLOAD_URL}
          download="monitor.apk"
          target="_blank"
          rel="noopener noreferrer"
        >
          <Download size={18} aria-hidden />
          {t("downloadApp")}
        </a>

        <div className="row" style={{ gap: 10 }}>
          <span className="brand-mark" aria-hidden />
          <div>
            <h1>{t("appName")}</h1>
            <p className="muted" style={{ margin: 0, fontSize: "0.9rem" }}>
              {t("pairSubtitle")}
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
            onChange={(e) => {
              setPhone(
                e.target.value.replace(/[^\d+\s]/g, "").slice(0, 16),
              );
              if (error) setError(null);
            }}
            placeholder={t("phonePlaceholder")}
            required
            disabled={busy}
          />
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            {t("phoneHelper")}
          </span>
        </div>

        <div className="field">
          <label htmlFor="pin">{t("password")}</label>
          <div className="password-field">
            <input
              id="pin"
              type={passwordVisible ? "text" : "password"}
              inputMode="numeric"
              pattern="[0-9]*"
              autoComplete="current-password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value.replace(/\D/g, "").slice(0, 12));
                if (error) setError(null);
              }}
              placeholder={t("passwordPlaceholder")}
              required
              minLength={4}
              disabled={busy}
            />
            <button
              type="button"
              className="icon-btn"
              aria-label={
                passwordVisible ? t("passwordHide") : t("passwordShow")
              }
              onClick={() => setPasswordVisible((v) => !v)}
            >
              {passwordVisible ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
          <span className="muted" style={{ fontSize: "0.78rem" }}>
            {returningUser
              ? t("passwordReturningHelper")
              : t("passwordHelper")}
          </span>
        </div>

        {showNameAndCode ? (
          <>
            <div className="field">
              <label htmlFor="name">{t("name")}</label>
              <input
                id="name"
                value={displayName}
                onChange={(e) => {
                  setDisplayName(e.target.value.slice(0, 48));
                  if (error) setError(null);
                }}
                autoComplete="name"
                placeholder={t("namePlaceholder")}
                disabled={busy || trialBlocked}
              />
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {t("nameHelper")}
              </span>
            </div>

            <div className="field">
              <label htmlFor="code">{t("inviteCode")}</label>
              <input
                id="code"
                value={code}
                onChange={(e) => {
                  setCode(
                    e.target.value
                      .toUpperCase()
                      .replace(/\s+/g, "")
                      .replace(/^MONITOR:/i, "")
                      .slice(0, 24),
                  );
                  if (error) setError(null);
                }}
                placeholder={t("codePlaceholder")}
                disabled={busy || trialBlocked}
                autoCapitalize="characters"
              />
              <span className="muted" style={{ fontSize: "0.78rem" }}>
                {t("codeHelper")}
              </span>
            </div>
          </>
        ) : null}

        {returningUser ? (
          <p className="muted" style={{ margin: 0, fontSize: "0.85rem" }}>
            {t("returningAccountHint")}
          </p>
        ) : null}

        {error ? (
          <div
            style={{
              padding: "10px 12px",
              borderRadius: 12,
              background: "color-mix(in srgb, var(--danger) 12%, transparent)",
              color: "var(--danger)",
              fontSize: "0.9rem",
            }}
          >
            <strong style={{ display: "block", marginBottom: 4 }}>
              {t("pairErrorTitle")}
            </strong>
            {error}
          </div>
        ) : null}

        <button
          className="btn btn-primary"
          type="submit"
          disabled={!canSubmit}
        >
          {busy ? t("loading") : t("continue")}
        </button>

        <p className="muted" style={{ margin: 0, fontSize: "0.8rem" }}>
          {t("pairFooter")}
        </p>
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
