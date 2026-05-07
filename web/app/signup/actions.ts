"use server";

import { signUpWithPassword } from "@/lib/auth";

export type SignUpFormState =
  | { ok: false; error: string; field?: "email" | "password" | "displayName" }
  | { ok: true; email: string; password: string }
  | undefined;

/**
 * Create the user and return a success state so the client component can
 * immediately call signIn() from next-auth/react. This decoupling avoids a
 * known quirk in next-auth v5 beta where calling server-side signIn() inside
 * a useActionState server action doesn't always propagate the redirect to the
 * browser correctly.
 */
export async function createAccountAction(
  _prev: SignUpFormState,
  formData: FormData
): Promise<SignUpFormState> {
  const password = formData.get("password") as string;
  const result = await signUpWithPassword({
    email: formData.get("email"),
    password,
    displayName: formData.get("displayName"),
  });
  if (!result.ok) {
    return result;
  }
  // Return credentials so the client can sign in without a second password prompt.
  return { ok: true, email: result.email, password };
}
