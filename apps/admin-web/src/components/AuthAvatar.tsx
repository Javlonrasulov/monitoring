"use client";

import { useEffect, useState } from "react";
import { authorizedMediaUrl } from "@/lib/api";

type Props = {
  userId?: string | null;
  name?: string;
  hasAvatar?: boolean;
  updatedAt?: string | null;
  online?: boolean;
  className?: string;
};

export function AuthAvatar({
  userId,
  name = "?",
  hasAvatar = false,
  updatedAt,
  online = false,
  className = "",
}: Props) {
  const [src, setSrc] = useState<string | null>(null);
  const letter = (name.trim().slice(0, 1) || "?").toUpperCase();

  useEffect(() => {
    if (!hasAvatar || !userId) {
      setSrc(null);
      return;
    }
    let alive = true;
    let objectUrl: string | null = null;
    const version = updatedAt ? `?v=${encodeURIComponent(updatedAt)}` : "";
    authorizedMediaUrl(`/chats/avatars/${userId}${version}`)
      .then((url) => {
        if (!alive) {
          URL.revokeObjectURL(url);
          return;
        }
        objectUrl = url;
        setSrc(url);
      })
      .catch(() => {
        if (alive) setSrc(null);
      });
    return () => {
      alive = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [userId, hasAvatar, updatedAt]);

  return (
    <span className={`msg-avatar${online ? " is-online" : ""} ${className}`.trim()}>
      {src ? <img src={src} alt="" /> : letter}
    </span>
  );
}
