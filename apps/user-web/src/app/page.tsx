"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { isPaired } from "@/lib/auth";

export default function HomePage() {
  const router = useRouter();

  useEffect(() => {
    router.replace(isPaired() ? "/chats" : "/login");
  }, [router]);

  return (
    <div className="auth-page">
      <div className="skeleton" style={{ width: 180, height: 24 }} />
    </div>
  );
}
