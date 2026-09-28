// app/layout.tsx

import type { Metadata } from "next";
import "@/styles/globals.css";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { BottomNav } from "@/components/shared/BottomNav";
import { AuthProvider } from "@/hooks/useAuth";

export const metadata: Metadata = {
  title: "IQ Cinema",
  description: "Watch and support independent film and series creators.",
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
        <AuthProvider>
          <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
            <main className="flex-1 pb-20">{children}</main>
            <BottomNav />
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
