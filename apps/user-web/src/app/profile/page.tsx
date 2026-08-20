"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/AppShell";
import { avatarUrl } from "@/lib/api";
import { clearSession, getSession } from "@/lib/auth";
import { disconnectChatSocket } from "@/lib/chat-socket";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";
import { useToast } from "@/lib/toast";
import type { DeviceMeResponse, SubscriptionDto } from "@/lib/types";

export default function ProfilePage() {
  const { t } = useI18n();
  const { mode, setMode } = useTheme();
  const toast = useToast();
  const router = useRouter();
  const session = getSession();

  const [me, setMe] = useState<DeviceMeResponse | null>(null);
  const [sub, setSub] = useState<SubscriptionDto | null>(null);
  const [supportUnread, setSupportUnread] = useState(0);
  const [busy, setBusy] = useState(false);
  const [modal, setModal] = useState<"name" | "phone" | "pin" | null>(null);
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [currentPin, setCurrentPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [confirmPin, setConfirmPin] = useState("");

  async function refresh() {
    const [profile, subscription, support] = await Promise.all([
      deviceApi.me(),
      deviceApi.subscription(),
      deviceApi.supportSummary(),
    ]);
    setMe(profile);
    setSub(subscription);
    setSupportUnread(support.unreadCount || 0);
    setName(profile.name || "");
    setPhone(profile.phone || "");
  }

  useEffect(() => {
    refresh().catch(() => toast.push("Failed to load profile", "err"));
  }, [toast]);

  async function saveName() {
    setBusy(true);
    try {
      await deviceApi.updateProfile({ name: name.trim() });
      setModal(null);
      await refresh();
    } catch {
      toast.push("Update failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function savePhone() {
    setBusy(true);
    try {
      await deviceApi.updateProfile({ phone: phone.trim() });
      setModal(null);
      await refresh();
    } catch {
      toast.push("Update failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function savePin() {
    if (newPin.length < 4 || newPin !== confirmPin) {
      toast.push("PIN mismatch", "err");
      return;
    }
    setBusy(true);
    try {
      await deviceApi.changePassword({
        currentPassword: currentPin,
        newPassword: newPin,
      });
      setModal(null);
      setCurrentPin("");
      setNewPin("");
      setConfirmPin("");
      toast.push("PIN updated", "ok");
    } catch {
      toast.push("PIN change failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function onAvatar(file: File | null) {
    if (!file) return;
    setBusy(true);
    try {
      const dataUrl = await readAsDataUrl(file);
      const base64 = dataUrl.split(",")[1] || "";
      await deviceApi.uploadAvatar(base64);
      await refresh();
    } catch {
      toast.push("Avatar upload failed", "err");
    } finally {
      setBusy(false);
    }
  }

  async function openSupport() {
    setBusy(true);
    try {
      const thread = await deviceApi.openSupport();
      router.push(`/chats/${thread.id}`);
    } catch {
      toast.push("Support unavailable", "err");
    } finally {
      setBusy(false);
    }
  }

  function logout() {
    disconnectChatSocket();
    clearSession();
    router.replace("/login");
  }

  const userId = me?.userId || session?.userId;
  const initials = (me?.name || session?.deviceName || "?").slice(0, 1).toUpperCase();

  return (
    <AppShell title={t("profile")}>
      <div className="stack" style={{ gap: 16, maxWidth: 720 }}>
        <section className="card stack" style={{ alignItems: "center" }}>
          <label className="avatar" style={{ width: 84, height: 84, fontSize: 28, cursor: "pointer" }}>
            {me?.hasAvatar && userId ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={avatarUrl(userId, me.avatarUpdatedAt)} alt="" />
            ) : (
              initials
            )}
            <input
              type="file"
              accept="image/*"
              className="sr-only"
              onChange={(e) => void onAvatar(e.target.files?.[0] || null)}
            />
          </label>
          <strong style={{ fontSize: "1.2rem" }}>{me?.name || session?.deviceName}</strong>
          <span className="muted">{me?.phone || "—"}</span>
          {me?.hasAvatar ? (
            <button
              type="button"
              className="btn btn-ghost"
              disabled={busy}
              onClick={() =>
                void deviceApi.deleteAvatar().then(refresh).catch(() => undefined)
              }
            >
              {t("delete")}
            </button>
          ) : null}
        </section>

        <section className="card stack">
          <button type="button" className="btn btn-secondary" onClick={() => setModal("name")}>
            {t("editName")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setModal("phone")}>
            {t("editPhone")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => setModal("pin")}>
            {t("changePin")}
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={busy}
            onClick={() => void openSupport()}
          >
            {t("callCenter")}
            {supportUnread > 0 ? ` (${supportUnread})` : ""}
          </button>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("subscription")}</h2>
          <div className="status-pill">
            {(sub?.plan || sub?.status || "NONE").toString()}
            {sub?.active ? ` · ${t("active")}` : ` · ${t("inactive")}`}
            {sub?.expiresAt
              ? ` · ${new Date(sub.expiresAt).toLocaleDateString()}`
              : ""}
          </div>
          {sub?.devicesUsed ? (
            <span className="muted">{sub.devicesUsed}</span>
          ) : null}
          {!sub?.active ? (
            <p style={{ margin: 0, color: "var(--warning)", fontSize: "0.9rem" }}>
              {t("subscriptionInactive")}
            </p>
          ) : null}
          <div className="feature-grid">
            {[
              { key: "video", label: t("featVideo"), ok: Boolean(sub?.canWatchVideo) },
              { key: "audio", label: t("featAudio"), ok: Boolean(sub?.canWatchAudio) },
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
            ].map((f) => (
              <div
                key={f.key}
                className={`feature-chip ${f.ok ? "on" : "off"}`}
              >
                <span>{f.ok ? "✓" : "–"}</span> {f.label}
              </div>
            ))}
          </div>
        </section>

        <section className="card stack">
          <h2 style={{ margin: 0, fontSize: "1.05rem" }}>{t("theme")}</h2>
          <div className="row" style={{ flexWrap: "wrap" }}>
            {(["system", "light", "dark"] as const).map((m) => (
              <button
                key={m}
                type="button"
                className={`btn ${mode === m ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setMode(m)}
              >
                {t(m)}
              </button>
            ))}
          </div>
        </section>

        <button type="button" className="btn btn-danger" onClick={logout}>
          {t("logout")}
        </button>
      </div>

      {modal ? (
        <div className="modal-scrim" onClick={() => setModal(null)}>
          <div className="modal stack" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ margin: 0 }}>
              {modal === "name"
                ? t("editName")
                : modal === "phone"
                  ? t("editPhone")
                  : t("changePin")}
            </h3>
            {modal === "name" ? (
              <div className="field">
                <label>{t("name")}</label>
                <input value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            ) : null}
            {modal === "phone" ? (
              <div className="field">
                <label>{t("phone")}</label>
                <input value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            ) : null}
            {modal === "pin" ? (
              <>
                <div className="field">
                  <label>Current PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={currentPin}
                    onChange={(e) => setCurrentPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="field">
                  <label>New PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={newPin}
                    onChange={(e) => setNewPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
                <div className="field">
                  <label>Confirm PIN</label>
                  <input
                    type="password"
                    inputMode="numeric"
                    value={confirmPin}
                    onChange={(e) => setConfirmPin(e.target.value.replace(/\D/g, ""))}
                  />
                </div>
              </>
            ) : null}
            <div className="row">
              <button type="button" className="btn btn-secondary" onClick={() => setModal(null)}>
                {t("cancel")}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                disabled={busy}
                onClick={() =>
                  void (modal === "name"
                    ? saveName()
                    : modal === "phone"
                      ? savePhone()
                      : savePin())
                }
              >
                {t("save")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </AppShell>
  );
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}
