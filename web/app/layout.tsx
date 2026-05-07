import type { Metadata } from "next";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { SiteNav } from "@/components/site-nav";

export const metadata: Metadata = {
  title: "AI 周报 · 为你而写",
  description:
    "同一份编辑流水线，按你的角色、所在团队、当前在做的项目重排和改写。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="zh-CN" suppressHydrationWarning>
      <head>
        {/* Newsreader = open-source serif standing in for Anthropic's
            proprietary Copernicus / Tiempos Headline (DESIGN.md §Typography).
            Inter Variable is the body face. Noto Serif SC supplies CJK glyphs
            for the serif headlines. */}
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossOrigin="anonymous"
        />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Newsreader:opsz,wght@6..72,400;6..72,500;6..72,600&family=Noto+Serif+SC:wght@400;500;600&family=Noto+Sans+SC:wght@400;500;600&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen bg-claude-canvas text-claude-body antialiased dark:bg-claude-dark dark:text-claude-on-dark">
        <ThemeProvider
          attribute="class"
          defaultTheme="light"
          enableSystem
          disableTransitionOnChange
        >
          <AuthProvider>
            <SiteNav />
            <main>{children}</main>
          </AuthProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
