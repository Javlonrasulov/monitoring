"use client";

import { useI18n, type Locale } from "@/lib/i18n";

const OPTIONS: { id: Locale; labelKey: "langRu" | "langEn" }[] = [
  { id: "ru", labelKey: "langRu" },
  { id: "en", labelKey: "langEn" },
];

export function LanguageSwitcher() {
  const { locale, setLocale, t } = useI18n();

  return (
    <div className="lang-switch" role="group" aria-label={t("langSwitch")}>
      {OPTIONS.map((option) => (
        <button
          key={option.id}
          type="button"
          className={locale === option.id ? "lang-switch-active" : undefined}
          aria-pressed={locale === option.id}
          onClick={() => setLocale(option.id)}
        >
          {t(option.labelKey)}
        </button>
      ))}
    </div>
  );
}
