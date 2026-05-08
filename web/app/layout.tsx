import type { Metadata } from "next";
import { Inter, Newsreader, Noto_Serif_SC, Noto_Sans_SC } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/theme-provider";
import { AuthProvider } from "@/components/auth-provider";
import { SiteNav } from "@/components/site-nav";

// Self-host the four fonts via next/font so they're preloaded with
// `font-display: swap`. This replaces the previous render-blocking
// `<link href="https://fonts.googleapis.com/...">` and is the single
// biggest first-paint win — saves the DNS / TLS / CSS round-trips.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const newsreader = Newsreader({
  subsets: ["latin"],
  weight: ["400", "500", "600"],
  variable: "--font-newsreader",
  display: "swap",
});

const notoSerifSc = Noto_Serif_SC({
  weight: ["400", "500", "600"],
  variable: "--font-noto-serif-sc",
  display: "swap",
  preload: false,
});

const notoSansSc = Noto_Sans_SC({
  weight: ["400", "500", "600"],
  variable: "--font-noto-sans-sc",
  display: "swap",
  preload: false,
});

export const metadata: Metadata = {
  title: "ZenoNews · 为你而写",
  description:
    "同一份编辑流水线，按你的角色、所在团队、当前在做的项目重排和改写。",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const fontVars = `${inter.variable} ${newsreader.variable} ${notoSerifSc.variable} ${notoSansSc.variable}`;
  return (
    <html lang="zh-CN" suppressHydrationWarning className={fontVars}>
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
