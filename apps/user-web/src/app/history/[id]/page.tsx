"use client";

import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import { ArrowLeft, Play } from "lucide-react";
import { Suspense, useEffect, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { DeviceRecordingDto } from "@/lib/types";

function HistoryInner() {
  const { id } = useParams<{ id: string }>();
  const params = useSearchParams();
  const name = params.get("name") || "";
  const { t } = useI18n();
  const toast = useToast();
  const [items, setItems] = useState<DeviceRecordingDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [playingUrl, setPlayingUrl] = useState<string | null>(null);

  async function load() {
    try {
      await deviceApi.startRecording(id).catch(() => undefined);
      const list = await deviceApi.deviceRecordings(id);
      setItems(
        list.filter((row) => {
          const s = (row.status || "").toUpperCase();
          return s === "READY" || s === "RECORDING";
        }),
      );
    } catch {
      toast.push(t("historyLoadFailed"), "err");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    void load();
    const timer = window.setInterval(() => void load(), 5000);
    return () => window.clearInterval(timer);
  }, [id]);

  async function play(rec: DeviceRecordingDto) {
    try {
      const res = await deviceApi.playbackUrl({ id: rec.id });
      setPlayingUrl(res.url);
    } catch {
      toast.push(t("playbackFailed"), "err");
    }
  }

  return (
    <AppShell hideChrome>
      <div className="stack" style={{ minHeight: "100dvh", padding: 16, gap: 14 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <Link href="/settings" className="icon-btn" aria-label={t("back")}>
            <ArrowLeft size={18} />
          </Link>
          <div style={{ textAlign: "center" }}>
            <strong>{t("history")}</strong>
            {name ? (
              <div className="muted" style={{ fontSize: "0.8rem" }}>
                {name}
              </div>
            ) : null}
          </div>
          <span style={{ width: 40 }} />
        </header>

        <p className="muted" style={{ margin: 0, fontSize: "0.88rem" }}>
          {t("historyHint")}
        </p>

        {playingUrl ? (
          <div className="card stack">
            <video
              src={playingUrl}
              controls
              autoPlay
              playsInline
              style={{ width: "100%", borderRadius: 12, background: "#000" }}
            />
            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => setPlayingUrl(null)}
            >
              {t("back")}
            </button>
          </div>
        ) : null}

        {loading ? (
          <div className="skeleton" style={{ height: 80 }} />
        ) : items.length === 0 ? (
          <div className="empty">
            <h3>{t("historyEmpty")}</h3>
          </div>
        ) : (
          <div className="stack">
            {items.map((row) => (
              <button
                key={row.id}
                type="button"
                className="card row"
                style={{
                  justifyContent: "space-between",
                  width: "100%",
                  textAlign: "left",
                  cursor: "pointer",
                }}
                onClick={() => void play(row)}
              >
                <div>
                  <strong>
                    {row.startedAt
                      ? new Date(row.startedAt).toLocaleString()
                      : row.id}
                  </strong>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {row.status}
                    {row.durationSec != null ? ` · ${row.durationSec}s` : ""}
                    {row.cameraFacing ? ` · ${row.cameraFacing}` : ""}
                  </div>
                </div>
                <Play size={18} />
              </button>
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <div className="auth-page">
          <div className="skeleton" style={{ width: 200, height: 24 }} />
        </div>
      }
    >
      <HistoryInner />
    </Suspense>
  );
}
