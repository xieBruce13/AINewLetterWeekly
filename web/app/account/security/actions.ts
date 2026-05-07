"use server";

import { auth, updatePassword, type UpdatePasswordResult } from "@/lib/auth";

export type SecurityFormState =
  | UpdatePasswordResult
  | undefined;

/**
 * Server action backing the /account/security form. Splits the auth check
 * (must be signed in) from the business logic (in `updatePassword`) so the
 * latter is unit-testable without a session.
 */
export async function updatePasswordAction(
  _prev: SecurityFormState,
  formData: FormData
): Promise<SecurityFormState> {
  const session = await auth();
  if (!session?.user?.id) {
    return { ok: false, error: "请先登录。" };
  }

  // Trust the session as a magic-link reset when:
  //   1. the most recent sign-in event was via the Resend provider, OR
  //   2. the user has no password_hash yet at all (they came in via demo
  //      or magic-link and are setting a password for the first time).
  // updatePassword() double-checks #2 against the DB; here we forward the
  // provider-based hint so it can short-circuit the current-password
  // prompt.
  const trustedReset = session.user.signInProvider === "resend";

  return updatePassword({
    userId: session.user.id,
    trustedReset,
    currentPassword: (formData.get("currentPassword") as string) || undefined,
    newPassword: (formData.get("newPassword") as string) || "",
    confirmPassword: (formData.get("confirmPassword") as string) || "",
  });
}
