"use client";

import type { CSSProperties } from "react";
import { useEffect, useState } from "react";
import { getToken } from "@/lib/auth";
import { authFileUrl } from "@/lib/device-api";

export function AuthedImage({
  threadId,
  messageId,
  alt = "",
  className,
  style,
}: {
  threadId: string;
  messageId: string;
  alt?: string;
  className?: string;
  style?: CSSProperties;
}) {
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    let objectUrl: string | null = null;
    let cancelled = false;
    const token = getToken();

    (async () => {
      for (const thumb of [true, false]) {
        try {
          const res = await fetch(authFileUrl(threadId, messageId, thumb), {
            headers: token ? { Authorization: `Bearer ${token}` } : {},
          });
          if (!res.ok) continue;
          const blob = await res.blob();
          objectUrl = URL.createObjectURL(blob);
          if (!cancelled) setSrc(objectUrl);
          return;
        } catch {
          /* try full */
        }
      }
    })();

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [threadId, messageId]);

  if (!src) {
    return <div className="skeleton" style={{ width: 180, height: 120, ...style }} />;
  }

  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} className={className} style={style} />;
}
