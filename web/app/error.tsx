"use client";

import { useEffect } from "react";

/**
 * Root error boundary — surfaces render failures in the App Router so the
 * dev overlay / Cursor simple browser show the real message instead of
 * "missing required error components".
 */
export default function ErrorPage({
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
    <div className="container-page py-16">
      <h1 className="font-display text-display-md tracking-display text-claude-ink dark:text-white">
        出错了
      </h1>
      <p className="mt-4 max-w-xl text-claude-body dark:text-white/70">
        {error.message}
      </p>
      {error.digest && (
        <p className="mt-2 text-[12px] text-claude-muted">
          digest: {error.digest}
        </p>
      )}
      <button
        type="button"
        onClick={() => reset()}
        className="btn-coral press mt-6"
      >
        重试
      </button>
    </div>
  );
}
