// app/layout.tsx

import type { Metadata } from "next";
import "@/styles/globals.css";
import { ThemeScript } from "@/components/shared/ThemeScript";
import { BottomNav } from "@/components/shared/BottomNav";

export const metadata: Metadata = {
  title: "IQ Cinema",
  description: "Watch and support independent film and series creators.",
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
        <ThemeScript />
      </head>
      <body className="font-sans">
        <div className="mx-auto flex min-h-dvh max-w-md flex-col bg-bg">
          <main className="flex-1 pb-20">{children}</main>
          <BottomNav />
        </div>
      </body>
    </html>
  );
}
