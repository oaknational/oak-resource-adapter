import { afterEach, describe, expect, it, vi } from "vitest";

import { buildExternalAccountOptions } from "./credentials.js";

vi.mock("@vercel/oidc", () => ({
  getVercelOidcToken: vi.fn(async () => "a-vercel-oidc-token"),
}));

const provider =
  "projects/1/locations/global/workloadIdentityPools/vercel/providers/vercel";
const serviceAccount = "wif-vercel-ora@oak.iam.gserviceaccount.com";

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("buildExternalAccountOptions", () => {
  const options = buildExternalAccountOptions({
    serviceAccount,
    workloadIdentityProvider: provider,
  });

  it("addresses the pool and the account to impersonate", () => {
    expect(options).toMatchObject({
      audience: `//iam.googleapis.com/${provider}`,
      service_account_impersonation_url:
        "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
        `${serviceAccount}:generateAccessToken`,
      subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
      type: "external_account",
    });
  });

  it("reads a token per exchange, because Vercel supplies it as a request header", async () => {
    const { getVercelOidcToken } = await import("@vercel/oidc");

    await expect(options.subject_token_supplier.getSubjectToken()).resolves.toBe(
      "a-vercel-oidc-token",
    );
    await options.subject_token_supplier.getSubjectToken();

    expect(getVercelOidcToken).toHaveBeenCalledTimes(2);
  });
});
