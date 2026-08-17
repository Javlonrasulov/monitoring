"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isLoggedIn } from "@/lib/auth";
import { useI18n } from "@/lib/i18n";

export default function HomePage() {
  const router = useRouter();
  const { t } = useI18n();

  useEffect(() => {
    router.replace(isLoggedIn() ? "/devices" : "/login");
  }, [router]);

  return <div className="center-screen">{t("loading")}</div>;
}
