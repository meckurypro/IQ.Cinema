// app/layout.tsx

import type { Metadata } from "next";
import "@/styles/globals.css";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { AppShell } from "@/components/shared/AppShell";
import { AuthProvider } from "@/hooks/useAuth";
import { ServiceWorkerRegister } from "@/components/shared/ServiceWorkerRegister";
import { UserSettingsProvider } from "@/hooks/useUserSettings";
import { I18nProvider } from "@/hooks/useI18n";
import { NotificationListener } from "@/components/shared/NotificationListener";

export const metadata: Metadata = {
  title: "IQ Cinema",
  description: "Watch and support independent film and series creators.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: "/IQCinemaIcon.png",
    apple: "/IQCinemaIcon.png",
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Fraunces:ital,wght@0,500;0,600;0,700;1,500;1,600;1,700&family=Manrope:wght@400;500;600;700;800&display=swap"
          rel="stylesheet"
        />
        {/* Tints the browser's own chrome (status bar / toolbar area on
            Android, and the equivalent on other mobile browsers) to match
            the app's theme. Content is kept in sync with the `dark` class
            by ThemeScript (first paint) and useTheme (live toggles) below —
            it has to be JS-driven, not a static/media-query meta tag,
            because the user's manual light/dark choice can override the
            OS-level color scheme. */}
        <meta id="theme-color-meta" name="theme-color" content="#faf9f7" />
        <ThemeScript />
      </head>
      <body className="font-sans">
        {/* Mounted once, here, at the root — this is what makes it safe for
            any number of components (layouts, pages, both at once) to call
            useAuth() without each one opening its own duplicate realtime
            subscription. See hooks/useAuth.tsx for why that mattered. */}
        <ServiceWorkerRegister />
        <AuthProvider>
          <UserSettingsProvider>
            <I18nProvider>
              <NotificationListener />
              <AppShell>{children}</AppShell>
            </I18nProvider>
          </UserSettingsProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
