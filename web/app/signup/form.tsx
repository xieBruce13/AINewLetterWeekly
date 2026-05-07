"use client";

import { useActionState } from "react";
import { Loader2 } from "lucide-react";
import { useFormStatus } from "react-dom";
import { createAccountAction, type SignUpFormState } from "./actions";

const initial: SignUpFormState = undefined;

/**
 * Sign-up form. We use `useActionState` for the redirect-or-error pattern:
 * server action returns an error object on failure, throws a redirect on
 * success. Field-level errors highlight the specific input.
 */
export function SignUpForm() {
  const [state, action] = useActionState(createAccountAction, initial);

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
