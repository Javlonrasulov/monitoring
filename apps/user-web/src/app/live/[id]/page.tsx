"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import {
  ArrowLeft,
  Maximize2,
  Minimize2,
  SwitchCamera,
  Volume2,
  VolumeX,
} from "lucide-react";
import {
  useEffect,
  useRef,
  useState,
  type MutableRefObject,
  type RefObject,
} from "react";
import { AppShell } from "@/components/AppShell";
import { API_URL } from "@/lib/api";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";
import type { DeviceRecordingDto } from "@/lib/types";

export default function LiveWatchPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("connecting");
  const [facing, setFacing] = useState<"FRONT" | "BACK">("BACK");
  const [blocked, setBlocked] = useState(false);
  const [muted, setMuted] = useState(false);
  const [audioEnabled, setAudioEnabled] = useState(false);
  const [fullscreen, setFullscreen] = useState(false);
  const [recordings, setRecordings] = useState<DeviceRecordingDto[]>([]);
  const [canRecordings, setCanRecordings] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setStatus("connecting");
      setBlocked(false);
      try {
        const token = await deviceApi.viewerToken(id);
        if (cancelled) return;
        setAudioEnabled(Boolean(token.audioEnabled));
        setCanRecordings(Boolean(token.canRecordings));
        if (token.videoEnabled === false) {
          setBlocked(true);
          setStatus("upgrade");
          return;
        }
        await playWhep(token.whepUrl, token.token, videoRef, pcRef);
        if (!cancelled) setStatus("live");
        if (token.canRecordings) {
          void deviceApi.startRecording(id).catch(() => undefined);
          const list = await deviceApi.deviceRecordings(id).catch(() => []);
          if (!cancelled) setRecordings(list);
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          toast.push(t("liveUnavailable"), "err");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [id, toast, t]);

  useEffect(() => {
    if (videoRef.current) videoRef.current.muted = muted;
  }, [muted]);

  async function switchCamera(next?: "FRONT" | "BACK") {
    const target = next || (facing === "BACK" ? "FRONT" : "BACK");
    try {
      await deviceApi.setCameraFacing(id, target);
      setFacing(target);
      toast.push(t("switchCamera"), "ok");
      window.setTimeout(() => {
        pcRef.current?.close();
        pcRef.current = null;
        void deviceApi.viewerToken(id).then(async (token) => {
          await playWhep(token.whepUrl, token.token, videoRef, pcRef);
          setStatus("live");
        });
      }, 2500);
    } catch {
      toast.push(t("cameraSwitchFailed"), "err");
    }
  }

  async function toggleFullscreen() {
    const el = stageRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      await el.requestFullscreen();
      setFullscreen(true);
    } else {
      await document.exitFullscreen();
      setFullscreen(false);
    }
  }

  async function playRecording(rec: DeviceRecordingDto) {
    try {
      const res = await deviceApi.playbackUrl({
        id: rec.id,
      });
      const openUrl = res.url.startsWith("http")
        ? res.url
        : `${API_URL.replace(/\/$/, "")}/${res.url.replace(/^\//, "").replace(/^api\/v1\//, "")}`;
      window.open(openUrl, "_blank", "noopener,noreferrer");
    } catch {
      toast.push(t("playbackFailed"), "err");
    }
  }

  return (
    <AppShell hideChrome>
      <div className="stack" style={{ minHeight: "100dvh", padding: 16, gap: 16 }}>
        <header className="row" style={{ justifyContent: "space-between" }}>
          <Link href="/settings" className="icon-btn" aria-label={t("back")}>
            <ArrowLeft size={18} />
          </Link>
          <strong>{t("watchLive")}</strong>
          <div className="row">
            {audioEnabled ? (
              <button
                type="button"
                className="icon-btn"
                onClick={() => setMuted((v) => !v)}
                aria-label={muted ? t("unmute") : t("mute")}
              >
                {muted ? <VolumeX size={18} /> : <Volume2 size={18} />}
              </button>
            ) : null}
            <button
              type="button"
              className="icon-btn"
              onClick={() => void toggleFullscreen()}
              aria-label={t("fullscreen")}
            >
              {fullscreen ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
          </div>
        </header>

        <div className="live-stage" ref={stageRef}>
          <video ref={videoRef} autoPlay playsInline muted={muted} />
          <div className="live-overlay">
            <span className="status-pill">{status}</span>
            <span className="status-pill">{facing}</span>
          </div>
        </div>

        <div className="row" style={{ justifyContent: "center", flexWrap: "wrap" }}>
          <button type="button" className={`btn ${facing === "BACK" ? "btn-primary" : "btn-secondary"}`} onClick={() => void switchCamera("BACK")}>
            {t("backCamera")}
          </button>
          <button type="button" className={`btn ${facing === "FRONT" ? "btn-primary" : "btn-secondary"}`} onClick={() => void switchCamera("FRONT")}>
            {t("frontCamera")}
          </button>
          <button type="button" className="btn btn-secondary" onClick={() => void switchCamera()}>
            <SwitchCamera size={16} /> {t("switchCamera")}
          </button>
        </div>

        {blocked ? (
          <p className="muted" style={{ textAlign: "center" }}>
            {t("watchUpgrade")}{" "}
            <Link href="/settings" style={{ color: "var(--teal-600)", fontWeight: 600 }}>
              {t("settings")}
            </Link>
          </p>
        ) : null}

        {!audioEnabled && status === "live" ? (
          <p className="muted" style={{ textAlign: "center", fontSize: "0.85rem" }}>
            {t("audioProPlusOnly")}
          </p>
        ) : null}

        {canRecordings ? (
          <section className="card stack">
            <h3 style={{ margin: 0 }}>{t("recordings")}</h3>
            {recordings.length === 0 ? (
              <p className="muted">{t("noRecordings")}</p>
            ) : (
              recordings.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  className="btn btn-secondary"
                  style={{ justifyContent: "space-between" }}
                  onClick={() => void playRecording(r)}
                >
                  <span>{r.startedAt ? new Date(r.startedAt).toLocaleString() : r.id}</span>
                  <span className="muted">{r.durationSec ? `${r.durationSec}s` : r.status}</span>
                </button>
              ))
            )}
          </section>
        ) : null}
      </div>
    </AppShell>
  );
}

async function playWhep(
  whepUrl: string,
  token: string,
  videoRef: RefObject<HTMLVideoElement | null>,
  pcRef: MutableRefObject<RTCPeerConnection | null>,
) {
  pcRef.current?.close();
  const pc = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
  });
  pcRef.current = pc;

  pc.addTransceiver("video", { direction: "recvonly" });
  pc.addTransceiver("audio", { direction: "recvonly" });

  pc.ontrack = (ev) => {
    const el = videoRef.current;
    if (!el) return;
    if (!el.srcObject) el.srcObject = new MediaStream();
    (el.srcObject as MediaStream).addTrack(ev.track);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);
  await waitIceGathering(pc);

  const res = await fetch(whepUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/sdp",
      Authorization: `Bearer ${token}`,
    },
    body: pc.localDescription?.sdp || offer.sdp,
  });
  if (!res.ok) throw new Error(`WHEP ${res.status}`);
  const answer = await res.text();
  await pc.setRemoteDescription({ type: "answer", sdp: answer });
}

function waitIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") return Promise.resolve();
  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    window.setTimeout(() => resolve(), 2000);
  });
}
