"use client";

import { useEffect, useState } from "react";
import { localeTag, useI18n } from "@/lib/i18n";

/** Formats a timestamp only on the client to avoid SSR locale hydration mismatches. */
export function FormattedDate({ value }: { value: string | null | undefined }) {
  const { locale } = useI18n();
  const [text, setText] = useState("—");

  useEffect(() => {
    if (!value) {
      setText("—");
      return;
    }
    const date = new Date(value);
    setText(
      Number.isNaN(date.getTime())
        ? "—"
        : date.toLocaleString(localeTag(locale)),
    );
  }, [locale, value]);

  return <span>{text}</span>;
}
