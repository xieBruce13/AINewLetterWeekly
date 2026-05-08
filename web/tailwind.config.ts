import type { Config } from "tailwindcss";
import animate from "tailwindcss-animate";

// Tokens come from web/DESIGN.md ("Claude").
// Cream canvas + warm coral primary + serif display, humanist sans body.
export default {
  darkMode: ["class"],
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    container: {
      center: true,
      padding: { DEFAULT: "1rem", sm: "1.5rem", lg: "2rem" },
      screens: { "2xl": "1280px" },
    },
    extend: {
      colors: {
        // shadcn-style runtime tokens (consumed by primitives & lib utils)
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },

        // Claude design tokens (literal hex, used directly in components)
        claude: {
          coral: "#cc785c",
          "coral-active": "#a9583e",
          "coral-disabled": "#e6dfd8",
          ink: "#141413",
          body: "#3d3d3a",
          "body-strong": "#252523",
          muted: "#6c6a64",
          "muted-soft": "#8e8b82",
          hairline: "#e6dfd8",
          "hairline-soft": "#ebe6df",
          canvas: "#faf9f5",
          "surface-soft": "#f5f0e8",
          "surface-card": "#efe9de",
          "surface-cream-strong": "#e8e0d2",
          dark: "#181715",
          "dark-elevated": "#252320",
          "dark-soft": "#1f1e1b",
          "on-dark": "#faf9f5",
          "on-dark-soft": "#a09d96",
          teal: "#5db8a6",
          amber: "#e8a55a",
        },
      },
      fontFamily: {
        // For headlines we keep Newsreader (Latin) up front. CJK glyphs fall
        // through to Noto Serif SC (self-hosted via next/font in layout.tsx)
        // — a much cleaner, more legible CJK serif than the OS-default
        // `Songti SC` which has hairline strokes that look poor on screen.
        display: [
          "var(--font-newsreader)",
          "Newsreader",
          "Copernicus",
          "Tiempos Headline",
          "ui-serif",
          "Georgia",
          "var(--font-noto-serif-sc)",
          "'Noto Serif SC'",
          "'Source Han Serif SC'",
          "'Songti SC'",
          "serif",
        ],
        // Body: Inter (Latin) → PingFang/Hiragino on Apple → Noto Sans SC as
        // the universal CJK fallback. Microsoft YaHei deliberately sits
        // BEHIND Noto Sans SC because YaHei renders thin and inconsistently
        // at body sizes on Windows; Noto Sans SC ships with hinting that
        // looks much sharper.
        sans: [
          "var(--font-inter)",
          "InterVariable",
          "Inter",
          "StyreneB",
          "system-ui",
          "-apple-system",
          "'PingFang SC'",
          "'Hiragino Sans GB'",
          "var(--font-noto-sans-sc)",
          "'Noto Sans SC'",
          "'Microsoft YaHei'",
          "sans-serif",
        ],
        mono: [
          "'JetBrains Mono'",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace",
        ],
      },
      fontSize: {
        // Claude typography ladder
        "display-xl": ["64px", { lineHeight: "1.05", letterSpacing: "-1.5px", fontWeight: "400" }],
        "display-lg": ["48px", { lineHeight: "1.10", letterSpacing: "-1px", fontWeight: "400" }],
        "display-md": ["36px", { lineHeight: "1.15", letterSpacing: "-0.5px", fontWeight: "400" }],
        "display-sm": ["28px", { lineHeight: "1.20", letterSpacing: "-0.3px", fontWeight: "400" }],
        "title-lg": ["22px", { lineHeight: "1.3", letterSpacing: "0", fontWeight: "500" }],
        "title-md": ["18px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
        "title-sm": ["16px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
        "body-md": ["16px", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        "body-sm": ["14px", { lineHeight: "1.55", letterSpacing: "0", fontWeight: "400" }],
        caption: ["13px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
        "caption-uc": ["12px", { lineHeight: "1.4", letterSpacing: "1.5px", fontWeight: "500" }],
        button: ["14px", { lineHeight: "1.0", letterSpacing: "0", fontWeight: "500" }],
        "nav-link": ["14px", { lineHeight: "1.4", letterSpacing: "0", fontWeight: "500" }],
      },
      borderRadius: {
        none: "0px",
        xs: "4px",
        sm: "6px",
        md: "8px",
        lg: "12px",
        xl: "16px",
        "2xl": "16px",
        pill: "9999px",
        full: "9999px",
      },
      spacing: {
        section: "96px",
      },
      boxShadow: {
        // Claude is a flat, hairline-driven system. The only "shadow" we ship
        // is a tinted hairline used for light-on-cream cards.
        hairline: "inset 0 0 0 1px #e6dfd8",
        "hairline-soft": "inset 0 0 0 1px #ebe6df",
        focus: "0 0 0 3px rgba(204, 120, 92, 0.25)",
      },
    },
  },
  plugins: [animate],
} satisfies Config;
