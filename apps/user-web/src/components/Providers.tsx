"use client";

import { ThemeProvider } from "@/lib/theme";
import { I18nProvider } from "@/lib/i18n";
import { ToastProvider } from "@/lib/toast";
import { PushBootstrap } from "@/components/PushBootstrap";
import type { ReactNode } from "react";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <ThemeProvider>
      <I18nProvider>
        <ToastProvider>
          <PushBootstrap />
          {children}
        </ToastProvider>
      </I18nProvider>
    </ThemeProvider>
  );
}
