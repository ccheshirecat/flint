import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/components/theme-provider";
import { I18nProvider } from "@/components/i18n-provider";
import { Toaster } from "@/components/ui/toaster";
import { Suspense } from "react";
import "./globals.css"
import "../styles/static-export-fixes.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: {
    default: "Flint - Premium KVM Virtualization Platform",
    template: "%s | Flint",
  },
  description: "Premium KVM management for enterprise-grade virtualization. Ignite your infrastructure with Flint.",
  icons: {
    icon: [
      { url: "/flint.svg", type: "image/svg+xml" },
      { url: "/favicon-16x16.png", sizes: "16x16", type: "image/png" },
      { url: "/favicon-32x32.png", sizes: "32x32", type: "image/png" },
      { url: "/android-chrome-192x192.png", sizes: "192x192", type: "image/png" },
      { url: "/android-chrome-512x512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: "/apple-touch-icon.png",
    shortcut: "/favicon.ico",
  },
  manifest: "/site.webmanifest",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body
        className={`
          font-sans antialiased
          ${GeistSans.variable}
          ${GeistMono.variable}
          ${inter.variable}
          bg-background text-foreground
          transition-colors duration-200 ease-out
          min-h-screen overflow-x-hidden
        `}
      >
        <Suspense fallback={
          <div className="fixed inset-0 bg-background flex items-center justify-center">
            <div className="flex items-center gap-2 text-muted-foreground">
              <div className="h-6 w-6 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              <span>Loading Flint...</span>
            </div>
          </div>
        }>
          <I18nProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="light"
              enableSystem
              disableTransitionOnChange={false} // Enable smooth theme transitions
            >
              {children}
              <Toaster />
            </ThemeProvider>
          </I18nProvider>
        </Suspense>
      </body>
    </html>
  );
}
