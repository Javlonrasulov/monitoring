import { Manrope } from "next/font/google";
import type { Metadata, Viewport } from "next";
import { Providers } from "@/components/Providers";
import "./globals.css";

const manrope = Manrope({
  subsets: ["latin", "cyrillic"],
  variable: "--font-manrope",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Telegram Monitor",
  description: "Telegram Monitor — chats, devices, subscription",
  applicationName: "Telegram Monitor",
  appleWebApp: {
    capable: true,
    title: "Telegram Monitor",
    statusBarStyle: "default",
  },
  icons: {
    icon: "/icon.svg",
  },
  manifest: "/manifest.webmanifest",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f4f7f7" },
    { media: "(prefers-color-scheme: dark)", color: "#060e0e" },
  ],
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={`${manrope.variable} antialiased`}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
