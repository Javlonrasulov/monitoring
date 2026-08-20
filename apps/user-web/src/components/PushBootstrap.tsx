"use client";

import { useEffect } from "react";
import { isPaired } from "@/lib/auth";
import { registerWebPush } from "@/lib/push";

/** Registers FCM when a device session exists. Quiet no-op without Firebase env. */
export function PushBootstrap() {
  useEffect(() => {
    if (!isPaired()) return;
    void registerWebPush();
  }, []);
  return null;
}
