"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { Device, StreamQuality } from "@/lib/types";
import { FormattedDate } from "./FormattedDate";
import { StatusBadge } from "./StatusBadge";
import { VideoPlayer } from "./VideoPlayer";

type Props = {
  device: Device;
};

export function LivePlayer({ device }: Props) {
  const { t } = useI18n();
  const containerRef = useRef<HTMLDivElement>(null);
  const videoElRef = useRef<HTMLVideoElement | null>(null);
  const userPaused = useRef(false);

  const [watching, setWatching] = useState(device.status === "STREAMING");
  const [muted, setMuted] = useState(true);
  const [quality, setQuality] = useState<StreamQuality>("MEDIUM");
  const [error, setError] = useState<string | null>(null);
  const [snapshotBusy, setSnapshotBusy] = useState(false);
  const [snapshotMsg, setSnapshotMsg] = useState<string | null>(null);

  // Phone already publishing → open the viewer automatically.
  useEffect(() => {
    if (device.status === "STREAMING" && !userPaused.current) {
      setWatching(true);
      return;
    }
    if (device.status !== "STREAMING") {
      userPaused.current = false;
      setWatching(false);
    }
  }, [device.status]);

  const handleReady = useCallback((video: HTMLVideoElement | null) => {
    videoElRef.current = video;
    if (video) setError(null);
  }, []);

  const handleError = useCallback((message: string | null) => {
    setError(message);
  }, []);

  async function toggleFullscreen() {
    const el = containerRef.current;
    if (!el) return;

    if (document.fullscreenElement) {
      await document.exitFullscreen();
      return;
    }
    await el.requestFullscreen();
  }

  async function takeSnapshot() {
    const video = videoElRef.current;
    if (!video || video.videoWidth === 0) {
      setSnapshotMsg(t("deviceVideoNotReady"));
      return;
    }

    setSnapshotBusy(true);
    setSnapshotMsg(null);

    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error(t("deviceCanvasUnavailable"));
      ctx.drawImage(video, 0, 0);
      const imageBase64 = canvas.toDataURL("image/jpeg", 0.85);

      await api.post(`/devices/${device.id}/snapshot`, { imageBase64 });
      setSnapshotMsg(t("deviceSnapshotSaved"));
    } catch (err) {
      setSnapshotMsg(err instanceof Error ? err.message : t("deviceSnapshotError"));
    } finally {
      setSnapshotBusy(false);
    }
  }

  return (
    <div className="live-player">
      <div className="live-header">
        <div>
          <h1 className="page-title">{device.name}</h1>
          <div className="live-subheader">
            <StatusBadge status={device.status} />
            <span className="muted">
              {t("deviceBattery")}:{" "}
              {device.batteryPercent != null ? `${device.batteryPercent}%` : "—"}
            </span>
            <span className="muted">
              {t("deviceNetwork")}: {device.networkType ?? "—"}
              {device.networkQuality != null ? ` (${device.networkQuality}%)` : ""}
            </span>
            <span className="muted">
              {t("deviceLastSeen")}: <FormattedDate value={device.lastSeen} />
            </span>
          </div>
        </div>
      </div>

      <div className="live-stage" ref={containerRef}>
        <VideoPlayer
          deviceId={device.id}
          active={watching}
          muted={muted}
          onError={handleError}
          onReady={handleReady}
        />
      </div>

      <div className="live-controls">
        <button
          type="button"
          className="btn btn-primary"
          onClick={() => {
            setError(null);
            setWatching((current) => {
              const next = !current;
              userPaused.current = !next;
              return next;
            });
          }}
        >
          {watching ? t("deviceStopWatching") : t("deviceWatchLive")}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => setMuted((v) => !v)}
        >
          {muted ? t("deviceUnmute") : t("deviceMute")}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          onClick={() => void toggleFullscreen()}
        >
          {t("deviceFullscreen")}
        </button>

        <button
          type="button"
          className="btn btn-secondary"
          disabled={snapshotBusy || !watching}
          onClick={() => void takeSnapshot()}
        >
          {snapshotBusy ? t("deviceSnapshotBusy") : t("deviceSnapshot")}
        </button>

        <label className="field inline-field">
          <span>{t("deviceQuality")}</span>
          <select
            value={quality}
            onChange={(e) => setQuality(e.target.value as StreamQuality)}
          >
            <option value="LOW">LOW</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="HIGH">HIGH</option>
          </select>
        </label>
      </div>

      {error && <p className="form-error">{error}</p>}
      {snapshotMsg && <p className="form-hint">{snapshotMsg}</p>}
    </div>
  );
}
