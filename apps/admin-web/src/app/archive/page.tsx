"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { AdminShell } from "@/components/AdminShell";
import { api, API_URL } from "@/lib/api";
import { isLoggedIn } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";
import { getSocket } from "@/lib/socket";
import type {
  CameraFacing,
  Device,
  RecordingSegment,
  RecordingSettings,
  RecordingStorage,
} from "@/lib/types";

type Preset = "today" | "yesterday" | "7d" | "30d" | "custom";

function pad(n: number) {
  return String(n).padStart(2, "0");
}

function toLocalInput(d: Date) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function startOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfDay(d: Date) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

function presetRange(preset: Preset, from: string, to: string): { from: Date; to: Date } {
  const now = new Date();
  if (preset === "today") return { from: startOfDay(now), to: endOfDay(now) };
  if (preset === "yesterday") {
    const y = new Date(now);
    y.setDate(y.getDate() - 1);
    return { from: startOfDay(y), to: endOfDay(y) };
  }
  if (preset === "7d") {
    const fromDate = startOfDay(new Date(now));
    fromDate.setDate(fromDate.getDate() - 6);
    return { from: fromDate, to: endOfDay(now) };
  }
  if (preset === "30d") {
    const fromDate = startOfDay(new Date(now));
    fromDate.setDate(fromDate.getDate() - 29);
    return { from: fromDate, to: endOfDay(now) };
  }
  return { from: new Date(from), to: new Date(to) };
}

function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDuration(sec: number | null) {
  if (sec == null) return "—";
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h > 0) return `${h}:${pad(m)}:${pad(s)}`;
  return `${m}:${pad(s)}`;
}

function formatClock(value: string) {
  const d = new Date(value);
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

function formatDay(value: string) {
  const d = new Date(value);
  return `${pad(d.getDate())}.${pad(d.getMonth() + 1)}.${d.getFullYear()}`;
}

function statusLabel(
  t: (key: "archiveStatusRECORDING" | "archiveStatusPROCESSING" | "archiveStatusREADY" | "archiveStatusFAILED" | "archiveStatusDELETED") => string,
  status: RecordingSegment["status"],
): string {
  if (status === "RECORDING") return t("archiveStatusRECORDING");
  if (status === "PROCESSING") return t("archiveStatusPROCESSING");
  if (status === "FAILED") return t("archiveStatusFAILED");
  if (status === "DELETED") return t("archiveStatusDELETED");
  return t("archiveStatusREADY");
}

export default function ArchivePage() {
  const router = useRouter();
  const { t } = useI18n();

  const now = useMemo(() => new Date(), []);
  const [devices, setDevices] = useState<Device[]>([]);
  const [deviceId, setDeviceId] = useState("all");
  const [camera, setCamera] = useState<"all" | CameraFacing>("all");
  const [preset, setPreset] = useState<Preset>("today");
  const [customFrom, setCustomFrom] = useState(toLocalInput(startOfDay(now)));
  const [customTo, setCustomTo] = useState(toLocalInput(now));
  const [items, setItems] = useState<RecordingSegment[]>([]);
  const [storage, setStorage] = useState<RecordingStorage | null>(null);
  const [settings, setSettings] = useState<RecordingSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [active, setActive] = useState<RecordingSegment | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<null | { title: string; run: () => Promise<void> }>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState("1");
  const [muted, setMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);

  const range = useMemo(
    () => presetRange(preset, customFrom, customTo),
    [preset, customFrom, customTo],
  );

  const query = useMemo(() => {
    const params: Record<string, string> = {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      pageSize: "200",
    };
    if (deviceId !== "all") params.deviceId = deviceId;
    if (camera !== "all") params.camera = camera;
    return params;
  }, [range, deviceId, camera]);

  const load = useCallback(async () => {
    setError(null);
    const qs = new URLSearchParams(query).toString();
    const [list, storageData, settingsData, deviceList] = await Promise.all([
      api.get<{ items: RecordingSegment[] }>(`/recordings/timeline?${qs}`),
      api.get<RecordingStorage>("/recordings/storage"),
      api.get<RecordingSettings>("/recordings/settings"),
      api.get<Device[]>("/devices"),
    ]);
    setItems(list.items);
    setStorage(storageData);
    setSettings(settingsData);
    setDevices(deviceList);
  }, [query]);

  useEffect(() => {
    if (!isLoggedIn()) {
      router.replace("/login");
      return;
    }
    let cancelled = false;
    setLoading(true);
    load()
      .catch((err: Error) => {
        if (!cancelled) setError(err.message || t("archiveLoadError"));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [load, router, t]);

  useEffect(() => {
    const socket = getSocket();
    const handler = () => {
      void load().catch(() => undefined);
    };
    socket.on("recording.status", handler);
    socket.emit("subscribe.org");
    return () => {
      socket.off("recording.status", handler);
    };
  }, [load]);

  async function openPlayback(row: RecordingSegment) {
    if (row.status !== "READY") return;
    setActive(row);
    const token = await api.post<{ url: string }>("/recordings/playback-url", {
      id: row.id,
    });
    setMediaUrl(`${API_URL}${token.url}`);
    setPlaying(true);
  }

  async function downloadOne(row: RecordingSegment) {
    const token = await api.post<{ url: string }>("/recordings/playback-url", {
      id: row.id,
      download: true,
    });
    window.location.href = `${API_URL}${token.url}`;
  }

  async function downloadRange() {
    const token = await api.post<{ url: string }>("/recordings/export-url", {
      deviceId: deviceId === "all" ? undefined : deviceId,
      camera: camera === "all" ? undefined : camera,
      from: range.from.toISOString(),
      to: range.to.toISOString(),
    });
    window.location.href = `${API_URL}${token.url}`;
  }

  function askDelete(title: string, run: () => Promise<void>) {
    setConfirm({ title, run });
  }

  const ticks = useMemo(() => {
    const span = range.to.getTime() - range.from.getTime();
    if (span <= 0) return [];
    const hour = 60 * 60 * 1000;
    const start = new Date(range.from);
    start.setMinutes(0, 0, 0);
    if (start < range.from) start.setTime(start.getTime() + hour);
    const marks: { label: string; left: number }[] = [];
    for (let t = start.getTime(); t <= range.to.getTime(); t += hour) {
      marks.push({
        label: `${pad(new Date(t).getHours())}:00`,
        left: ((t - range.from.getTime()) / span) * 100,
      });
    }
    return marks;
  }, [range]);

  function onTimelineClick(event: React.MouseEvent<HTMLDivElement>) {
    const rect = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - rect.left) / rect.width;
    const at = range.from.getTime() + ratio * (range.to.getTime() - range.from.getTime());
    const hit =
      items.find((row) => {
        const start = new Date(row.startedAt).getTime();
        const end = row.endedAt ? new Date(row.endedAt).getTime() : start + 60_000;
        return at >= start && at <= end;
      }) ?? items.find((row) => new Date(row.startedAt).getTime() >= at);
    if (hit) void openPlayback(hit);
  }

  return (
    <AdminShell>
      <div className="archive-page">
        <div className="page-header">
          <div>
            <h1 className="page-title">{t("archiveTitle")}</h1>
            <p className="page-subtitle">{t("archiveSubtitle")}</p>
          </div>
          {storage && (
            <div className={`storage-card storage-${storage.level}`}>
              <div className="storage-label">{t("archiveStorage")}</div>
              <div className="storage-value">
                {formatBytes(storage.usedBytes)} / {formatBytes(storage.totalBytes)}
              </div>
              <div className="storage-bar">
                <span style={{ width: `${Math.min(100, storage.usedRatio * 100)}%` }} />
              </div>
              <div className="storage-meta">
                {t("archiveRecordingSize")}: {formatBytes(storage.recordingBytes)} ·{" "}
                {t("archiveFree")}: {formatBytes(storage.freeBytes)}
              </div>
            </div>
          )}
        </div>

        <div className="archive-filters">
          <label className="field">
            <span>{t("navDevices")}</span>
            <select value={deviceId} onChange={(e) => setDeviceId(e.target.value)}>
              <option value="all">{t("archiveAllDevices")}</option>
              {devices.map((device) => (
                <option key={device.id} value={device.id}>
                  {device.name}
                </option>
              ))}
            </select>
          </label>
          <label className="field">
            <span>{t("deviceCameraFront")}</span>
            <select
              value={camera}
              onChange={(e) => setCamera(e.target.value as "all" | CameraFacing)}
            >
              <option value="all">{t("archiveAllCameras")}</option>
              <option value="FRONT">{t("deviceCameraFront")}</option>
              <option value="BACK">{t("deviceCameraBack")}</option>
            </select>
          </label>
          <div className="preset-row">
            {(
              [
                ["today", t("archiveToday")],
                ["yesterday", t("archiveYesterday")],
                ["7d", t("archiveLast7")],
                ["30d", t("archiveLast30")],
                ["custom", t("archiveCustom")],
              ] as const
            ).map(([id, label]) => (
              <button
                key={id}
                type="button"
                className={`btn btn-secondary btn-sm${preset === id ? " btn-active" : ""}`}
                onClick={() => setPreset(id)}
              >
                {label}
              </button>
            ))}
          </div>
          {preset === "custom" && (
            <>
              <label className="field">
                <span>{t("archiveFrom")}</span>
                <input
                  type="datetime-local"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                />
              </label>
              <label className="field">
                <span>{t("archiveTo")}</span>
                <input
                  type="datetime-local"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                />
              </label>
            </>
          )}
          {settings && (
            <label className="field">
              <span>{t("archiveRetention")}</span>
              <select
                value={settings.retentionDays}
                onChange={(e) => {
                  const retentionDays = Number(e.target.value);
                  setSettings({ ...settings, retentionDays });
                  void api.patch("/recordings/settings", { retentionDays });
                }}
              >
                {[3, 7, 14, 30, 60].map((days) => (
                  <option key={days} value={days}>
                    {days} {t("archiveDays")}
                  </option>
                ))}
              </select>
            </label>
          )}
          {settings && (
            <label className="field">
              <span>{t("archiveAutoCleanup")}</span>
              <select
                value={settings.autoCleanup ? "1" : "0"}
                onChange={(e) => {
                  const autoCleanup = e.target.value === "1";
                  setSettings({ ...settings, autoCleanup });
                  void api.patch("/recordings/settings", { autoCleanup });
                }}
              >
                <option value="1">{t("archiveOn")}</option>
                <option value="0">{t("archiveOff")}</option>
              </select>
            </label>
          )}
        </div>

        <div className="archive-layout">
          <section className="archive-player-card">
            {mediaUrl ? (
              <>
                <video
                  ref={videoRef}
                  className="archive-video"
                  src={mediaUrl}
                  autoPlay
                  muted={muted}
                  onPlay={() => setPlaying(true)}
                  onPause={() => setPlaying(false)}
                  onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
                  onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
                  onEnded={() => {
                    const idx = items.findIndex((row) => row.id === active?.id);
                    const next = items.slice(idx + 1).find((row) => row.status === "READY");
                    if (next) void openPlayback(next);
                  }}
                />
                <div className="archive-player-bar">
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      const el = videoRef.current;
                      if (!el) return;
                      if (el.paused) void el.play();
                      else el.pause();
                    }}
                  >
                    {playing ? t("archivePause") : t("archivePlay")}
                  </button>
                  <input
                    className="archive-seek"
                    type="range"
                    min={0}
                    max={duration || 0}
                    step={0.1}
                    value={currentTime}
                    onChange={(e) => {
                      const el = videoRef.current;
                      const value = Number(e.target.value);
                      if (el) el.currentTime = value;
                      setCurrentTime(value);
                    }}
                  />
                  <span className="archive-time">
                    {formatDuration(Math.floor(currentTime))} / {formatDuration(Math.floor(duration))}
                  </span>
                  <select
                    value={speed}
                    onChange={(e) => {
                      setSpeed(e.target.value);
                      if (videoRef.current) videoRef.current.playbackRate = Number(e.target.value);
                    }}
                  >
                    {["0.5", "1", "1.5", "2"].map((rate) => (
                      <option key={rate} value={rate}>
                        {rate}x
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => {
                      setMuted((v) => {
                        if (videoRef.current) videoRef.current.muted = !v;
                        return !v;
                      });
                    }}
                  >
                    {muted ? t("deviceUnmute") : t("deviceMute")}
                  </button>
                  <button
                    type="button"
                    className="btn btn-secondary btn-sm"
                    onClick={() => void videoRef.current?.requestFullscreen()}
                  >
                    {t("deviceFullscreen")}
                  </button>
                </div>
                {active && (
                  <div className="archive-now">
                    {active.deviceName} · {active.cameraFacing === "FRONT" ? t("deviceCameraFront") : t("deviceCameraBack")} ·{" "}
                    {formatDay(active.startedAt)} {formatClock(active.startedAt)}
                  </div>
                )}
              </>
            ) : (
              <div className="archive-player-empty">{t("archiveNoPlayer")}</div>
            )}
          </section>

          <section className="archive-timeline-card">
            <div className="timeline-scale">
              {ticks.map((tick) => (
                <span key={tick.label + tick.left} style={{ left: `${tick.left}%` }}>
                  {tick.label}
                </span>
              ))}
            </div>
            <div className="timeline-track" onClick={onTimelineClick} role="presentation">
              {items.map((row) => {
                const span = range.to.getTime() - range.from.getTime();
                const start = new Date(row.startedAt).getTime();
                const end = row.endedAt
                  ? new Date(row.endedAt).getTime()
                  : Math.min(Date.now(), start + 60_000);
                const left = ((start - range.from.getTime()) / span) * 100;
                const width = Math.max(0.4, ((end - start) / span) * 100);
                return (
                  <button
                    key={row.id}
                    type="button"
                    className={`timeline-seg timeline-${row.status.toLowerCase()}${active?.id === row.id ? " is-active" : ""}`}
                    style={{ left: `${left}%`, width: `${width}%` }}
                    title={`${row.deviceName} ${formatClock(row.startedAt)}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      void openPlayback(row);
                    }}
                  />
                );
              })}
            </div>
            <div className="timeline-legend">
              <span className="legend-ready">{t("archiveStatusREADY")}</span>
              <span className="legend-recording">{t("archiveStatusRECORDING")}</span>
              <span className="legend-gap">{t("archiveGap")}</span>
            </div>
          </section>
        </div>

        <div className="archive-actions">
          <button type="button" className="btn btn-secondary" onClick={() => void downloadRange()}>
            {t("archiveDownloadRange")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            disabled={selected.size === 0}
            onClick={() =>
              askDelete(t("archiveConfirmDelete"), async () => {
                await api.post("/recordings/delete-bulk", { ids: [...selected] });
                setSelected(new Set());
                await load();
              })
            }
          >
            {t("archiveDeleteSelected")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              askDelete(t("archiveConfirmDelete"), async () => {
                await api.post("/recordings/delete-range", {
                  deviceId: deviceId === "all" ? undefined : deviceId,
                  camera: camera === "all" ? undefined : camera,
                  from: range.from.toISOString(),
                  to: range.to.toISOString(),
                });
                await load();
              })
            }
          >
            {t("archiveDeleteRange")}
          </button>
          <button
            type="button"
            className="btn btn-secondary"
            onClick={() =>
              askDelete(t("archiveConfirmDelete"), async () => {
                await api.post("/recordings/delete-range", { all: true });
                await load();
              })
            }
          >
            {t("archiveDeleteAll")}
          </button>
        </div>

        {error && <p className="form-error">{error}</p>}
        {loading && <p className="muted">{t("loading")}</p>}

        <div className="archive-list">
          {items.length === 0 && !loading ? (
            <div className="empty-state">{t("archiveEmpty")}</div>
          ) : (
            items.map((row) => (
              <div
                key={row.id}
                className={`archive-row${active?.id === row.id ? " is-active" : ""}`}
              >
                <input
                  type="checkbox"
                  checked={selected.has(row.id)}
                  onChange={(e) => {
                    const next = new Set(selected);
                    if (e.target.checked) next.add(row.id);
                    else next.delete(row.id);
                    setSelected(next);
                  }}
                  aria-label={t("archiveSelect")}
                />
                <button type="button" className="archive-row-main" onClick={() => void openPlayback(row)}>
                  <strong>{row.deviceName}</strong>
                  <span>
                    {row.cameraFacing === "FRONT" ? t("deviceCameraFront") : t("deviceCameraBack")}
                  </span>
                  <span>
                    {formatDay(row.startedAt)} {formatClock(row.startedAt)}
                    {row.endedAt ? ` – ${formatClock(row.endedAt)}` : ""}
                  </span>
                  <span>{formatDuration(row.durationSec)}</span>
                  <span>{formatBytes(row.fileSize)}</span>
                  <span className={`rec-status rec-${row.status.toLowerCase()}`}>
                    {statusLabel(t, row.status)}
                  </span>
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  disabled={row.status !== "READY"}
                  onClick={() => void downloadOne(row)}
                >
                  {t("archiveDownload")}
                </button>
                <button
                  type="button"
                  className="btn btn-ghost btn-sm"
                  onClick={() =>
                    askDelete(t("archiveConfirmDelete"), async () => {
                      await api.delete(`/recordings/${row.id}`);
                      await load();
                    })
                  }
                >
                  {t("archiveDelete")}
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      {confirm && (
        <div className="modal-backdrop">
          <div className="modal-panel">
            <p>{confirm.title}</p>
            <div className="archive-actions" style={{ marginTop: "1rem" }}>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  const run = confirm.run;
                  setConfirm(null);
                  void run();
                }}
              >
                {t("archiveDelete")}
              </button>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => setConfirm(null)}
              >
                {t("archiveCancel")}
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
