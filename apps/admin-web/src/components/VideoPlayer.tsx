"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import { useI18n } from "@/lib/i18n";
import type { ViewerTokenResponse } from "@/lib/types";

type Props = {
  deviceId: string;
  active: boolean;
  muted: boolean;
  onError?: (message: string | null) => void;
  onReady?: (video: HTMLVideoElement | null) => void;
};

/**
 * MediaMTX only forwards HTTP basic credentials to its external auth endpoint,
 * so the short-lived stream token travels as the password.
 */
function streamCredentials(streamToken: string): string {
  return `Basic ${btoa(`monitor:${streamToken}`)}`;
}

function whepErrorText(body: string, status: number, fallback: string): {
  message: string;
  waitingForPublisher: boolean;
} {
  const trimmed = body.trim();
  if (trimmed.startsWith("{")) {
    try {
      const parsed = JSON.parse(trimmed) as { error?: string };
      const error = parsed.error ?? "";
      if (error.includes("no one is publishing")) {
        return { message: fallback, waitingForPublisher: true };
      }
      if (error) {
        return { message: error, waitingForPublisher: false };
      }
    } catch {
      // fall through
    }
  }
  return {
    message: trimmed || `${fallback} (${status})`,
    waitingForPublisher: false,
  };
}

function waitForIceGathering(pc: RTCPeerConnection): Promise<void> {
  if (pc.iceGatheringState === "complete") {
    return Promise.resolve();
  }

  return new Promise((resolve) => {
    const check = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", check);
        resolve();
      }
    };
    pc.addEventListener("icegatheringstatechange", check);
    setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", check);
      resolve();
    }, 8000);
  });
}

export function VideoPlayer({
  deviceId,
  active,
  muted,
  onError,
  onReady,
}: Props) {
  const { t } = useI18n();
  const videoRef = useRef<HTMLVideoElement>(null);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const resourceUrlRef = useRef<string | null>(null);
  const tokenRef = useRef<string | null>(null);
  const onErrorRef = useRef(onError);
  const onReadyRef = useRef(onReady);
  const [connecting, setConnecting] = useState(false);

  useEffect(() => {
    onErrorRef.current = onError;
    onReadyRef.current = onReady;
  }, [onError, onReady]);

  const cleanup = useCallback(async () => {
    const pc = pcRef.current;
    pcRef.current = null;

    if (pc) {
      pc.ontrack = null;
      pc.close();
    }

    const video = videoRef.current;
    if (video) {
      video.srcObject = null;
    }

    const resourceUrl = resourceUrlRef.current;
    const token = tokenRef.current;
    resourceUrlRef.current = null;
    tokenRef.current = null;

    if (resourceUrl && token) {
      try {
        await fetch(resourceUrl, {
          method: "DELETE",
          headers: { Authorization: streamCredentials(token) },
        });
      } catch {
        // ignore teardown errors
      }
    }

    onReadyRef.current?.(null);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (video) {
      video.muted = muted;
    }
  }, [muted]);

  useEffect(() => {
    let cancelled = false;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let attempt = 0;

    async function start() {
      if (!active) {
        await cleanup();
        setConnecting(false);
        onErrorRef.current?.(null);
        return;
      }

      setConnecting(true);
      onErrorRef.current?.(null);

      try {
        const viewer = await api.post<ViewerTokenResponse>(
          `/streaming/devices/${deviceId}/viewer-token`,
        );

        if (cancelled) return;

        tokenRef.current = viewer.token;

        const pc = new RTCPeerConnection({
          iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
        });
        pcRef.current = pc;

        pc.addTransceiver("video", { direction: "recvonly" });
        pc.addTransceiver("audio", { direction: "recvonly" });

        pc.ontrack = (event) => {
          const el = videoRef.current;
          if (!el) return;
          const stream = event.streams[0] ?? new MediaStream([event.track]);
          el.srcObject = stream;
          void el.play().catch(() => undefined);
          onReadyRef.current?.(el);
        };

        pc.onconnectionstatechange = () => {
          if (cancelled || pc !== pcRef.current) return;
          if (pc.connectionState === "failed") {
            scheduleRetry();
          }
          if (pc.connectionState === "disconnected") {
            retryTimer = setTimeout(() => {
              if (cancelled || pc !== pcRef.current) return;
              if (
                pc.connectionState === "disconnected" ||
                pc.connectionState === "failed"
              ) {
                scheduleRetry();
              }
            }, 2_500);
          }
        };

        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await waitForIceGathering(pc);

        if (cancelled) {
          await cleanup();
          return;
        }

        const res = await fetch(viewer.whepUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/sdp",
            Authorization: streamCredentials(viewer.token),
          },
          body: pc.localDescription?.sdp ?? offer.sdp,
        });

        if (!res.ok) {
          const text = await res.text();
          const parsed = whepErrorText(text, res.status, t("videoWhepError"));
          const error = new Error(parsed.message) as Error & {
            waitingForPublisher?: boolean;
          };
          error.waitingForPublisher = parsed.waitingForPublisher;
          throw error;
        }

        const location = res.headers.get("Location");
        if (location) {
          resourceUrlRef.current = new URL(location, viewer.whepUrl).toString();
        }

        const answerSdp = await res.text();
        await pc.setRemoteDescription({ type: "answer", sdp: answerSdp });
        attempt = 0;

        if (!cancelled) {
          setConnecting(false);
        }
      } catch (err) {
        if (!cancelled) {
          const waiting =
            err instanceof Error &&
            "waitingForPublisher" in err &&
            Boolean((err as { waitingForPublisher?: boolean }).waitingForPublisher);
          setConnecting(waiting);
          onErrorRef.current?.(
            waiting
              ? t("videoWaitingPublisher")
              : err instanceof Error
                ? err.message
                : t("videoStreamFailed"),
          );
          scheduleRetry(waiting ? 2_000 : undefined);
        }
      }
    }

    function scheduleRetry(delayMs?: number) {
      if (cancelled || !active) return;
      if (retryTimer) clearTimeout(retryTimer);
      void cleanup();
      const delay = delayMs ?? Math.min(8_000, 2_000 * 2 ** attempt);
      attempt += 1;
      retryTimer = setTimeout(() => {
        if (!cancelled && active) void start();
      }, delay);
    }

    void start();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      void cleanup();
    };
  }, [active, cleanup, deviceId]);

  return (
    <div className="video-shell">
      <video
        ref={videoRef}
        className="video-el"
        playsInline
        autoPlay
        muted={muted}
      />
      {connecting && (
        <div className="video-overlay">
          <span>{t("videoConnecting")}</span>
        </div>
      )}
      {!active && !connecting && (
        <div className="video-overlay">
          <span>{t("videoIdle")}</span>
        </div>
      )}
    </div>
  );
}
