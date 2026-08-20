"use client";

import { LanguageProvider } from "@/lib/i18n";
import { ThemeProvider } from "@/lib/theme";
import { PushBootstrap } from "@/components/PushBootstrap";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <PushBootstrap />
        {children}
      </LanguageProvider>
    </ThemeProvider>
  );
}
