import type { FederatedIdentity } from "./configuration.js";

/**
 * Describes the Vercel-to-GCP token exchange.
 *
 * `buildExternalAccountOptions` in `packages/db` is the same dozen lines. The
 * duplication holds the layering: storage must not depend on db. ADAPT-63
 * revisits it when a third consumer appears.
 *
 * `getSubjectToken` runs per exchange rather than once here, because
 * `getVercelOidcToken` reads the `x-vercel-oidc-token` request header before
 * falling back to the environment.
 */
export function buildExternalAccountOptions(identity: FederatedIdentity) {
  return {
    audience: `//iam.googleapis.com/${identity.workloadIdentityProvider}`,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${identity.serviceAccount}:generateAccessToken`,
    subject_token_supplier: {
      getSubjectToken: async () => {
        const { getVercelOidcToken } = await import("@vercel/oidc");

        return getVercelOidcToken();
      },
    },
    subject_token_type: "urn:ietf:params:oauth:token-type:jwt",
    token_url: "https://sts.googleapis.com/v1/token",
    type: "external_account",
  };
}
