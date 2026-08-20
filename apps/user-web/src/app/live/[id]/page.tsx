"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { ArrowLeft, SwitchCamera } from "lucide-react";
import type { MutableRefObject, RefObject } from "react";
import { useEffect, useRef, useState } from "react";
import { AppShell } from "@/components/AppShell";
import { deviceApi } from "@/lib/device-api";
import { useI18n } from "@/lib/i18n";
import { useToast } from "@/lib/toast";

export default function LiveWatchPage() {
  const { id } = useParams<{ id: string }>();
  const { t } = useI18n();
  const toast = useToast();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const [status, setStatus] = useState("connecting");
  const [facing, setFacing] = useState<"FRONT" | "BACK">("BACK");
  const [blocked, setBlocked] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      setStatus("connecting");
      setBlocked(false);
      try {
        const token = await deviceApi.viewerToken(id);
        if (cancelled) return;
        if (token.videoEnabled === false) {
          setBlocked(true);
          setStatus("upgrade");
          return;
        }
        await playWhep(token.whepUrl, token.token, videoRef, pcRef);
        if (!cancelled) setStatus("live");
      } catch {
        if (!cancelled) {
          setStatus("error");
          toast.push("Live unavailable", "err");
        }
      }
    }

    void start();
    return () => {
      cancelled = true;
      pcRef.current?.close();
      pcRef.current = null;
    };
  }, [id, toast]);

  async function switchCamera() {
    const next = facing === "BACK" ? "FRONT" : "BACK";
    try {
      await deviceApi.setCameraFacing(id, next);
      setFacing(next);
      toast.push(t("switchCamera"), "ok");
      // reconnect after brief delay like Android
      window.setTimeout(() => {
        pcRef.current?.close();
        pcRef.current = null;
        void deviceApi.viewerToken(id).then(async (token) => {
          await playWhep(token.whepUrl, token.token, videoRef, pcRef);
          setStatus("live");
        });
      }, 2500);
    } catch {
      toast.push("Camera switch failed", "err");
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
          <button
            type="button"
            className="icon-btn"
            onClick={() => void switchCamera()}
            aria-label={t("switchCamera")}
          >
            <SwitchCamera size={18} />
          </button>
        </header>

        <div className="live-stage">
          <video ref={videoRef} autoPlay playsInline muted={false} />
        </div>

        <div style={{ textAlign: "center" }}>
          <span className="status-pill">{status}</span>
          {blocked ? (
            <p className="muted">{t("subscription")} required for video</p>
          ) : null}
        </div>
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

  if (!res.ok) {
    throw new Error(`WHEP ${res.status}`);
  }

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
