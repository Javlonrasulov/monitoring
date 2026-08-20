"use client";

import {
  Check,
  Moon,
  Sun,
  Monitor,
  Palette,
  Languages,
} from "lucide-react";
import { useI18n, type Locale } from "@/lib/i18n";
import { useTheme, type ThemeMode } from "@/lib/theme";

const LANGS: { id: Locale; labelKey: "langEn" | "langRu"; caption: string }[] = [
  { id: "en", labelKey: "langEn", caption: "English" },
  { id: "ru", labelKey: "langRu", caption: "Русский" },
];

export function AppearanceSheet({ onClose }: { onClose: () => void }) {
  const { t, locale, setLocale } = useI18n();
  const { mode, setMode } = useTheme();

  const themes: { id: ThemeMode; label: string; icon: typeof Sun }[] = [
    { id: "system", label: t("system"), icon: Monitor },
    { id: "light", label: t("light"), icon: Sun },
    { id: "dark", label: t("dark"), icon: Moon },
  ];

  return (
    <div className="modal-scrim" onClick={onClose}>
      <div
        className="modal appearance-sheet stack"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-label={t("language")}
      >
        <div className="sheet-handle" aria-hidden />

        <div className="sheet-section-title">
          <Palette size={16} />
          {t("theme")}
        </div>
        <div className="theme-segments">
          {themes.map((item) => {
            const Icon = item.icon;
            const active = mode === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`theme-segment ${active ? "active" : ""}`}
                onClick={() => setMode(item.id)}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </div>

        <div className="sheet-section-title">
          <Languages size={16} />
          {t("language")}
        </div>
        <div className="stack" style={{ gap: 8 }}>
          {LANGS.map((lang) => {
            const selected = locale === lang.id;
            return (
              <button
                key={lang.id}
                type="button"
                className={`lang-option ${selected ? "active" : ""}`}
                onClick={() => {
                  setLocale(lang.id);
                  onClose();
                }}
              >
                <div>
                  <strong>{t(lang.labelKey)}</strong>
                  <div className="muted" style={{ fontSize: "0.8rem" }}>
                    {lang.caption}
                  </div>
                </div>
                {selected ? <Check size={18} /> : null}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );
}
