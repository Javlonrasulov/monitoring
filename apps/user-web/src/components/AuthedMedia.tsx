"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { getToken } from "@/lib/auth";
import { authFileUrl } from "@/lib/device-api";

async function loadBlob(
  threadId: string,
  messageId: string,
  thumb: boolean,
): Promise<string> {
  const token = getToken();
  const res = await fetch(authFileUrl(threadId, messageId, thumb), {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
  if (!res.ok) throw new Error("media failed");
  return URL.createObjectURL(await res.blob());
}

export function AuthedMedia({
  threadId,
  messageId,
  kind,
  className,
  style,
  round,
  controls = true,
  autoPlay,
  muted,
}: {
  threadId: string;
  messageId: string;
  kind: "image" | "video" | "audio" | "video_note";
  className?: string;
  style?: CSSProperties;
  round?: boolean;
  controls?: boolean;
  autoPlay?: boolean;
  muted?: boolean;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const urlRef = useRef<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const preferThumb = kind === "image";
        let url: string;
        try {
          url = await loadBlob(threadId, messageId, preferThumb);
        } catch {
          url = await loadBlob(threadId, messageId, false);
        }
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        urlRef.current = url;
        setSrc(url);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    };
  }, [threadId, messageId, kind]);

  if (!src) {
    return (
      <div
        className="skeleton"
        style={{
          width: round ? 180 : 220,
          height: round ? 180 : kind === "audio" ? 44 : 140,
          borderRadius: round ? "50%" : 12,
          ...style,
        }}
      />
    );
  }

  if (kind === "image") {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={src} alt="" className={className} style={style} />;
  }

  if (kind === "audio") {
    return (
      <audio src={src} controls={controls} className={className} style={{ width: "100%", ...style }} />
    );
  }

  return (
    <video
      src={src}
      controls={controls}
      playsInline
      autoPlay={autoPlay}
      muted={muted}
      className={className}
      style={{
        borderRadius: round ? "50%" : 12,
        maxHeight: round ? 220 : 320,
        width: round ? 180 : "100%",
        height: round ? 180 : undefined,
        objectFit: "cover",
        background: "#000",
        ...style,
      }}
    />
  );
}
