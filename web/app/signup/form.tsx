"use client";

import { useActionState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { signIn } from "next-auth/react";
import { createAccountAction, type SignUpFormState } from "./actions";

const initial: SignUpFormState = undefined;

/**
 * Sign-up form. The server action creates the user; on success we call
 * signIn() from next-auth/react here on the client so the redirect is handled
 * correctly regardless of the next-auth version's server-action support.
 */
export function SignUpForm() {
  const [state, action] = useActionState(createAccountAction, initial);

  useEffect(() => {
    if (state?.ok) {
      signIn("password", {
        email: state.email,
        password: state.password,
        callbackUrl: "/onboarding",
      });
    }
  }, [state]);

  // While waiting for the signIn redirect, keep showing a spinner.
  if (state?.ok) {
    return (
      <div className="flex flex-col items-center gap-3 py-8 text-claude-muted">
        <Loader2 className="h-6 w-6 animate-spin text-claude-coral" />
        <p className="text-[13px]">账号创建成功，正在登录…</p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      <div className="space-y-2">
        <label
          htmlFor="displayName"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          显示名
        </label>
        <input
          id="displayName"
          name="displayName"
          type="text"
          required
          minLength={1}
          maxLength={60}
          autoComplete="name"
          placeholder="你希望我们怎么称呼你"
          className={inputClass(state?.field === "displayName")}
        />
        {state?.field === "displayName" && (
          <FieldError msg={state.error} />
        )}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="email"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          邮箱
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          placeholder="you@company.com"
          className={inputClass(state?.field === "email")}
        />
        {state?.field === "email" && <FieldError msg={state.error} />}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="password"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          密码
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          placeholder="至少 8 位"
          className={inputClass(state?.field === "password")}
        />
        {state?.field === "password" && <FieldError msg={state.error} />}
        <p className="text-[12px] text-claude-muted">
          至少 8 位。我们用 bcrypt 加盐存储，永远不会在数据库里看到明文。
        </p>
      </div>

      {/* Generic (non-field) error */}
      {state && !state.ok && !state.field && (
        <div className="rounded-md bg-claude-coral/10 px-3 py-2 text-[13px] text-claude-coral">
          {state.error}
        </div>
      )}

      <SubmitButton />
    </form>
  );
}

function SubmitButton() {
  const { pending } = useFormStatus();
  return (
    <button
      type="submit"
      disabled={pending}
      className="btn-coral press w-full disabled:cursor-not-allowed disabled:opacity-60"
    >
      {pending ? (
        <span className="inline-flex items-center gap-2">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          创建中…
        </span>
      ) : (
        "创建账号 → 下一步"
      )}
    </button>
  );
}

function FieldError({ msg }: { msg: string }) {
  return (
    <p className="text-[12px] text-claude-coral" role="alert">
      {msg}
    </p>
  );
}

function inputClass(error?: boolean): string {
  return [
    "input-claude",
    error
      ? "border-claude-coral/50 focus:border-claude-coral focus:ring-claude-coral/30"
      : "",
  ]
    .filter(Boolean)
    .join(" ");
}
