"use client";

import { SessionProvider } from "next-auth/react";

/**
 * Thin wrapper so client components (like the sign-in form) can call the
 * client-side `signIn()` helper. The server still uses `auth()` from
 * `@/lib/auth` directly — this provider is purely for the client surface.
 */
export function AuthProvider({ children }: { children: React.ReactNode }) {
  return <SessionProvider>{children}</SessionProvider>;
}
