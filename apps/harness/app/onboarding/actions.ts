"use server";

import { auth, clerkClient } from "@clerk/nextjs/server";
import { redirect } from "next/navigation";

import { isDevelopmentClerkInstance, parseRegion, safeReturnTo } from "./onboarding";

async function signedInDevelopmentUser(): Promise<string> {
  if (!isDevelopmentClerkInstance(process.env.CLERK_SECRET_KEY)) {
    throw new Error(
      "The stand-in onboarding writes only to the development Clerk instance.",
    );
  }
  const { userId } = await auth();
  if (userId === null) {
    throw new Error("Sign in before setting up the account.");
  }
  return userId;
}

/** Writes what OWA onboarding writes that ORA reads. */
export async function completeOnboarding(formData: FormData): Promise<void> {
  const userId = await signedInDevelopmentUser();
  await (
    await clerkClient()
  ).users.updateUserMetadata(userId, {
    publicMetadata: { owa: { isOnboarded: true } },
    privateMetadata: { region: parseRegion(formData.get("region")) },
  });
  redirect(safeReturnTo(formData.get("returnTo")));
}

export async function clearOnboarding(formData: FormData): Promise<void> {
  const userId = await signedInDevelopmentUser();
  // Clerk deep-merges metadata, and null removes a key.
  await (
    await clerkClient()
  ).users.updateUserMetadata(userId, {
    publicMetadata: { owa: { isOnboarded: null } },
    privateMetadata: { region: null },
  });
  redirect(safeReturnTo(formData.get("returnTo")));
}
