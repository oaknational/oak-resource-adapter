import {
  AuthTypes,
  Connector,
  IpAddressTypes,
} from "@google-cloud/cloud-sql-connector";
import { ExternalAccountClient } from "google-auth-library";
import type { PoolConfig } from "pg";

/**
 * Connects the deployed API to Cloud SQL without a long-lived credential: Vercel
 * mints a short-lived OIDC token per request, GCP's Security Token Service
 * exchanges it for an access token, and the connector opens an mTLS tunnel.
 *
 * CI takes a different route. `db-migrate.yml` runs Cloud SQL Proxy as a
 * separate process, and `scripts/migrate.mjs` never loads this module.
 */

/** Set together or not at all; the presence of the first selects this path. */
export type CloudSqlConfig = {
  database: string;
  instanceConnectionName: string;
  ipType: IpAddressTypes;
  serviceAccount: string;
  user: string;
  workloadIdentityProvider: string;
};

function requireEnv(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(
      `${name} is required when CLOUD_SQL_INSTANCE_CONNECTION_NAME is set. ` +
        "Connecting to Cloud SQL by OIDC needs the whole set.",
    );
  }

  return value;
}

/** Returns null when this deployment is not configured for Cloud SQL. */
export function readCloudSqlConfig(): CloudSqlConfig | null {
  if (!process.env.CLOUD_SQL_INSTANCE_CONNECTION_NAME?.trim()) {
    return null;
  }

  const configuredIpType = process.env.CLOUD_SQL_IP_TYPE?.trim().toUpperCase();

  if (configuredIpType && !(configuredIpType in IpAddressTypes)) {
    throw new Error(
      `CLOUD_SQL_IP_TYPE must be one of ${Object.keys(IpAddressTypes).join(", ")}.`,
    );
  }

  return {
    database: requireEnv("CLOUD_SQL_DATABASE"),
    instanceConnectionName: requireEnv("CLOUD_SQL_INSTANCE_CONNECTION_NAME"),
    ipType: (configuredIpType as IpAddressTypes | undefined) ?? IpAddressTypes.PUBLIC,
    serviceAccount: requireEnv("GCP_SERVICE_ACCOUNT"),
    // A service account's email with the .gserviceaccount.com suffix removed,
    // which is the form Cloud SQL expects of an IAM database user.
    user: requireEnv("CLOUD_SQL_USER"),
    workloadIdentityProvider: requireEnv("GCP_WORKLOAD_IDENTITY_PROVIDER"),
  };
}

/**
 * Describes the Vercel-to-GCP token exchange.
 *
 * `getSubjectToken` runs per exchange rather than once here, because
 * `getVercelOidcToken` reads the `x-vercel-oidc-token` request header before
 * falling back to the environment.
 */
export function buildExternalAccountOptions(config: CloudSqlConfig) {
  return {
    audience: `//iam.googleapis.com/${config.workloadIdentityProvider}`,
    scopes: ["https://www.googleapis.com/auth/cloud-platform"],
    service_account_impersonation_url:
      "https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/" +
      `${config.serviceAccount}:generateAccessToken`,
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

function createGoogleAuthClient(config: CloudSqlConfig) {
  const client = ExternalAccountClient.fromJSON(buildExternalAccountOptions(config));

  if (!client) {
    throw new Error(
      "Could not build a Google external account client from the Cloud SQL configuration.",
    );
  }

  return client;
}

/**
 * Resolves the `pg` options for a Cloud SQL connection. Asynchronous because the
 * connector fetches instance metadata and certificates first, which is why
 * `initialiseDatabaseClient` exists.
 */
export async function createCloudSqlPoolConfig(
  config: CloudSqlConfig,
): Promise<PoolConfig> {
  const connector = new Connector({ auth: createGoogleAuthClient(config) });

  const connectionOptions = await connector.getOptions({
    // The instance trusts the impersonated service account, so no database
    // password exists.
    authType: AuthTypes.IAM,
    instanceConnectionName: config.instanceConnectionName,
    ipType: config.ipType,
  });

  return {
    ...connectionOptions,
    database: config.database,
    user: config.user,
  };
}
