"use client";

import { useActionState } from "react";
import { useFormStatus } from "react-dom";
import { Loader2, ShieldCheck } from "lucide-react";
import { updatePasswordAction, type SecurityFormState } from "./actions";

const initial: SecurityFormState = undefined;

interface SecurityFormProps {
  /**
   * Whether to skip the "current password" field. We hide it when the user
   * arrived via a magic-link reset OR when the user has no password yet
   * (first-time set), since either case authenticates identity by other
   * means.
   */
  skipCurrentPassword: boolean;
}

export function SecurityForm({ skipCurrentPassword }: SecurityFormProps) {
  const [state, action] = useActionState(updatePasswordAction, initial);

  // After a successful update we render an inline confirmation banner —
  // the form state stays mounted so the user can navigate away on their
  // own (no auto-redirect: rotating their password from /account/security
  // shouldn't kick them off the page).
  if (state?.ok) {
    return (
      <div
        role="status"
        className="rounded-lg border border-claude-coral/30 bg-claude-coral/10 px-4 py-3 text-[14px] text-claude-ink dark:text-white"
      >
        <div className="flex items-center gap-2 font-semibold">
          <ShieldCheck className="h-4 w-4 text-claude-coral" />
          密码已更新
        </div>
        <p className="mt-1 text-[13px] text-claude-body dark:text-white/70">
          下次登录请用新密码。其他设备上的登录状态暂时不会被踢下线。
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {!skipCurrentPassword && (
        <div className="space-y-2">
          <label
            htmlFor="currentPassword"
            className="block text-[13px] font-medium text-claude-ink dark:text-white"
          >
            当前密码
          </label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            autoComplete="current-password"
            className={inputClass(state?.field === "currentPassword")}
          />
          {state?.field === "currentPassword" && (
            <FieldError msg={state.error} />
          )}
        </div>
      )}

      <div className="space-y-2">
        <label
          htmlFor="newPassword"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          新密码
        </label>
        <input
          id="newPassword"
          name="newPassword"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          placeholder="至少 8 位"
          className={inputClass(state?.field === "newPassword")}
        />
        {state?.field === "newPassword" && <FieldError msg={state.error} />}
      </div>

      <div className="space-y-2">
        <label
          htmlFor="confirmPassword"
          className="block text-[13px] font-medium text-claude-ink dark:text-white"
        >
          再输入一次新密码
        </label>
        <input
          id="confirmPassword"
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          maxLength={200}
          autoComplete="new-password"
          className={inputClass(state?.field === "confirmPassword")}
        />
        {state?.field === "confirmPassword" && (
          <FieldError msg={state.error} />
        )}
      </div>

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
          保存中…
        </span>
      ) : (
        "保存新密码"
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
