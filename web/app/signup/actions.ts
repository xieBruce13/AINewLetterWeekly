"use server";

import { redirect } from "next/navigation";
import { signIn, signUpWithPassword } from "@/lib/auth";

export type SignUpFormState =
  | { ok: false; error: string; field?: "email" | "password" | "displayName" }
  | undefined;

/**
 * Create the user, then auto-sign-in via the `password` Credentials provider
 * and bounce to /onboarding. Returning a state object lets the form surface
 * field-level errors (email already taken, weak password, etc.) without
 * throwing a runtime error in the action.
 *
 * On success this function NEVER returns — `redirect()` throws a
 * NEXT_REDIRECT internally.
 */
export async function createAccountAction(
  _prev: SignUpFormState,
  formData: FormData
): Promise<SignUpFormState> {
  const result = await signUpWithPassword({
    email: formData.get("email"),
    password: formData.get("password"),
    displayName: formData.get("displayName"),
  });
  if (!result.ok) {
    return result;
  }

  // Sign in immediately. We pass `redirectTo: "/onboarding"` so a brand new
  // user always lands on the profile-collection step before seeing the feed.
  await signIn("password", {
    email: result.email,
    password: formData.get("password") as string,
    redirectTo: "/onboarding",
  });

  // Belt-and-suspenders: signIn redirects internally; this is here in case
  // some adapter / runtime swallows the redirect.
  redirect("/onboarding");
}
