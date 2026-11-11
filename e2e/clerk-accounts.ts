import { randomUUID } from "node:crypto";

import { expect } from "@playwright/test";

const clerkApi = "https://api.clerk.com/v1";
const mutablePrefix = "ora-e2e+mutable-";
const staleAfterMs = 60 * 60 * 1000;

type ClerkUser = {
  id: string;
  created_at: number;
  email_addresses: { email_address: string }[];
  public_metadata: { owa?: { isOnboarded?: boolean } };
  private_metadata: { ora?: { acceptedTerms?: { version?: number } } };
};

function clerkHeaders() {
  return {
    Authorization: `Bearer ${process.env.CLERK_SECRET_KEY ?? ""}`,
    "Content-Type": "application/json",
  };
}

/**
 * ORA offers nothing until OWA onboarding sets its flag, and starts no work until
 * the teacher accepts its terms. The harness can clear both, so every run restores
 * what a test account needs. Without `termsVersion`, acceptance is left as it is.
 */
export async function prepareAccount(
  emailAddress: string,
  { termsVersion }: Readonly<{ termsVersion?: number }> = {},
) {
  const headers = clerkHeaders();
  const response = await fetch(
    `${clerkApi}/users?email_address=${encodeURIComponent(emailAddress)}`,
    { headers },
  );
  expect(response.ok, "A browser-test account could not be looked up.").toBe(true);
  const [user] = (await response.json()) as ClerkUser[];
  expect(user, "A browser-test account does not exist.").toBeDefined();
  if (user === undefined) {
    return;
  }
  const onboarded = user.public_metadata.owa?.isOnboarded === true;
  const accepted =
    termsVersion === undefined ||
    (user.private_metadata.ora?.acceptedTerms?.version ?? 0) >= termsVersion;
  if (onboarded && accepted) {
    return;
  }
  const update = await fetch(`${clerkApi}/users/${user.id}/metadata`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      ...(onboarded ? {} : { public_metadata: { owa: { isOnboarded: true } } }),
      ...(accepted
        ? {}
        : {
            private_metadata: {
              ora: {
                acceptedTerms: {
                  version: termsVersion,
                  acceptedAt: new Date().toISOString(),
                },
              },
            },
          }),
    }),
  });
  expect(update.ok, "A browser-test account could not be made ready.").toBe(true);
}

async function deleteUser(userId: string) {
  const response = await fetch(`${clerkApi}/users/${userId}`, {
    method: "DELETE",
    headers: clerkHeaders(),
  });
  // Another run's sweep may have deleted it first.
  expect(
    response.ok || response.status === 404,
    "A browser-test account could not be deleted.",
  ).toBe(true);
}

/** Deletes mutable accounts left behind by runs that were cancelled. */
async function deleteStaleMutableAccounts() {
  const response = await fetch(
    `${clerkApi}/users?query=${encodeURIComponent(mutablePrefix)}&limit=100`,
    { headers: clerkHeaders() },
  );
  expect(response.ok, "Old browser-test accounts could not be listed.").toBe(true);
  const staleBefore = Date.now() - staleAfterMs;
  const stale = ((await response.json()) as ClerkUser[]).filter(
    (user) =>
      user.created_at < staleBefore &&
      user.email_addresses.some(({ email_address }) =>
        email_address.startsWith(mutablePrefix),
      ),
  );
  await Promise.all(stale.map(({ id }) => deleteUser(id)));
}

/**
 * An onboarded account for one run's tests that change account state, so
 * concurrent runs never share it. Call `remove` when the tests finish.
 */
export async function createMutableAccount() {
  await deleteStaleMutableAccounts();
  const emailAddress = `${mutablePrefix}${randomUUID()}@example.com`;
  const response = await fetch(`${clerkApi}/users`, {
    method: "POST",
    headers: clerkHeaders(),
    body: JSON.stringify({
      email_address: [emailAddress],
      first_name: "Browser",
      last_name: "Test",
      public_metadata: { owa: { isOnboarded: true } },
      skip_password_requirement: true,
    }),
  });
  expect(response.ok, "A browser-test account could not be created.").toBe(true);
  const { id } = (await response.json()) as ClerkUser;
  return { emailAddress, remove: () => deleteUser(id) };
}
