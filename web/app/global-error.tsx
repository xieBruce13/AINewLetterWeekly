"use client";

import { useEffect } from "react";

/**
 * Catches errors in the **root** `layout.tsx` (e.g. when `SiteNav` pulls
 * in `auth` → `db/client` and `DATABASE_URL` is missing). Plain `error.tsx`
 * does not cover the root layout.
 *
 * Uses inline styles only — this tree replaces `layout.tsx`, so Tailwind
 * from `globals.css` may not apply; class-only styling can look like a
 * blank white page in some browsers.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <html lang="zh-CN">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          padding: "2rem",
          fontFamily: "system-ui, sans-serif",
          background: "#faf9f5",
          color: "#141413",
        }}
      >
        <h1 style={{ fontSize: "1.5rem", margin: "0 0 1rem" }}>出错了</h1>
        <p style={{ maxWidth: "36rem", lineHeight: 1.6 }}>
          {error.message || "Unknown error"}
        </p>
        <p style={{ marginTop: "1.5rem", fontSize: "13px", color: "#6c6a64" }}>
          If the terminal says the app is on a different port (e.g. 3002),
          open that URL — not an older tab on 3001.
        </p>
        <button
          type="button"
          onClick={() => reset()}
          style={{
            marginTop: "1.5rem",
            padding: "0.5rem 1rem",
            borderRadius: "6px",
            border: "none",
            cursor: "pointer",
            background: "#cc785c",
            color: "#fff",
            fontWeight: 600,
          }}
        >
          重试
        </button>
      </body>
    </html>
  );
}
