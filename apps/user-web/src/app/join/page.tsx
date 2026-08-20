"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense } from "react";

function JoinInner() {
  const router = useRouter();
  const params = useSearchParams();
  const code = params.get("code") || "";

  useEffect(() => {
    const q = code ? `?code=${encodeURIComponent(code)}` : "";
    router.replace(`/login${q}`);
  }, [code, router]);

  return (
    <div className="auth-page">
      <div className="skeleton" style={{ width: 180, height: 24 }} />
    </div>
  );
}

export default function JoinPage() {
  return (
    <Suspense fallback={<div className="auth-page" />}>
      <JoinInner />
    </Suspense>
  );
}
