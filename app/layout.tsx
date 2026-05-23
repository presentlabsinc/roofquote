import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Toaster } from "@/components/ui/sonner";
import { BottomNav } from "@/components/BottomNav";

export const metadata: Metadata = {
  title: "지붕견적 — RoofQuote",
  description: "현장에서 바로 쓰는 지붕공사 견적 도구",
  applicationName: "지붕견적",
  appleWebApp: {
    capable: true,
    title: "지붕견적",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: true,
  },
  icons: {
    icon: "/icon.svg",
    apple: "/icon.svg",
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f8fa" },
    { media: "(prefers-color-scheme: dark)", color: "#f7f8fa" },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko" className="h-full">
      <head>
        <link
          rel="preload"
          as="style"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
        <link
          rel="stylesheet"
          href="https://cdn.jsdelivr.net/gh/orioncactus/pretendard@v1.3.9/dist/web/variable/pretendardvariable-dynamic-subset.min.css"
        />
      </head>
      <body className="min-h-full flex flex-col bg-background text-foreground antialiased">
        <main className="flex-1 pb-32 safe-x">{children}</main>
        <BottomNav />
        <Toaster richColors position="top-center" />
      </body>
    </html>
  );
}
