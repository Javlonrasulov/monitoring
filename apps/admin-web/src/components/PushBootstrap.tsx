"use client";

import { useEffect } from "react";
import { isLoggedIn } from "@/lib/auth";
import { registerWebPush } from "@/lib/push";

/** Registers FCM when an admin session exists. Quiet no-op without Firebase env. */
export function PushBootstrap() {
  useEffect(() => {
    if (!isLoggedIn()) return;
    void registerWebPush();
  }, []);
  return null;
}
