"use client";

import { useState } from "react";
import { signOut } from "next-auth/react";

/**
 * Robust sign-out for NextAuth v5 beta + JWT:
 *   1. Tell next-auth NOT to redirect (its built-in redirect lands on a
 *      stale RSC tree and renders a 404 in some flows).
 *   2. After the cookie has been cleared, force a hard browser navigation
 *      to "/" so every server component re-renders with no session.
 */
export function SignOutButton() {
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      disabled={pending}
      onClick={async () => {
        setPending(true);
        try {
          await signOut({ redirect: false });
        } finally {
          window.location.href = "/";
        }
      }}
      className="btn-ghost press"
    >
      {pending ? "退出中…" : "退出"}
    </button>
  );
}
