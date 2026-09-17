import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { parseArgs } from "node:util";
import {
  createDatabaseClient,
  downloadFixtureDocument,
  downloadFixtureMimeType,
  localDownloadFixtureKey,
  seedDownloadFixture,
} from "@oaknational/resource-adapter-db";
import { loadOriginalResourceDocumentFixture } from "@oaknational/resource-adapter-original-resource-documents/fixtures";
import { getArtifactMetadata } from "@oaknational/resource-adapter-storage";
import { z } from "zod";

export function seedSettings(env) {
  let databaseUrl;
  try {
    databaseUrl = new URL(env.DATABASE_URL);
  } catch {
    throw new Error("Set DATABASE_URL to your local PostgreSQL database.");
  }
  if (
    !["postgres:", "postgresql:"].includes(databaseUrl.protocol) ||
    !["localhost", "127.0.0.1", "[::1]"].includes(databaseUrl.hostname) ||
    databaseUrl.pathname === "/ora" ||
    env.VERCEL ||
    env.CLOUD_SQL_INSTANCE_CONNECTION_NAME ||
    env.DATABASE_CA_CERT
  ) {
    throw new Error(
      "db:seed:dev only supports the local development database, not deployed databases or the staging proxy.",
    );
  }
  if (!z.uuid().safeParse(env.RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID).success)
    throw new Error(
      "Set RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID from the shared local development configuration.",
    );
  if (!env.E2E_CLERK_USER_EMAIL || !env.CLERK_SECRET_KEY)
    throw new Error(
      "Set E2E_CLERK_USER_EMAIL and CLERK_SECRET_KEY to resolve the fixture's test teacher.",
    );
  return {
    databaseUrl: env.DATABASE_URL,
    artifactId: env.RESOURCE_ARTIFACT_DOWNLOAD_FIXTURE_ID,
    email: env.E2E_CLERK_USER_EMAIL,
    clerkKey: env.CLERK_SECRET_KEY,
  };
}

export async function resolveTeacher({ email, clerkKey }) {
  const url = new URL("https://api.clerk.com/v1/users");
  url.searchParams.set("email_address", email);
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${clerkKey}` },
    signal: AbortSignal.timeout(15000),
  });
  if (!response.ok)
    throw new Error(`Could not look up the test teacher (HTTP ${response.status}).`);
  const body = await response.json();
  const users = Array.isArray(body) ? body : body.data;
  if (
    !Array.isArray(users) ||
    users.length !== 1 ||
    typeof users[0]?.id !== "string" ||
    !users[0].id.startsWith("user_")
  )
    throw new Error(
      "Expected exactly one existing Clerk test teacher; no user was created.",
    );
  return users[0].id;
}

export async function seedLocalDatabase({ reset = false } = {}) {
  const settings = seedSettings(process.env);
  const teacherId = await resolveTeacher(settings);
  const metadata = await getArtifactMetadata(localDownloadFixtureKey);
  const byteSize = Number(metadata.size);
  if (
    !Number.isSafeInteger(byteSize) ||
    byteSize <= 0 ||
    metadata.contentType !== downloadFixtureMimeType ||
    !metadata.md5Hash
  )
    throw new Error("The shared local DOCX fixture has invalid storage metadata.");
  // Validate the local target and fixture prerequisites before destructive work.
  if (reset) {
    const result = spawnSync("pnpm", ["db:reset"], {
      cwd: fileURLToPath(new URL("../../../", import.meta.url)),
      env: process.env,
      stdio: "inherit",
    });
    if (result.error || result.status !== 0)
      throw new Error("Local database reset failed; seeding was not attempted.");
  }
  const { expectedDocument } = await loadOriginalResourceDocumentFixture(
    "linear-equations-smoke",
  );
  const database = createDatabaseClient(settings.databaseUrl);
  try {
    const artifact = await seedDownloadFixture(database, {
      document: downloadFixtureDocument(expectedDocument),
      artifactId: settings.artifactId,
      teacherId,
      key: localDownloadFixtureKey,
      byteSize,
      checksum: metadata.md5Hash,
    });
    console.log(
      `Local download fixture ready: ${artifact.id}. Existing bucket object reused.`,
    );
  } finally {
    await database.$client.end();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { reset: { type: "boolean" } } });
  seedLocalDatabase({ reset: values.reset }).catch((error) => {
    // Driver errors can contain connection details; report only the actionable outer message.
    console.error(
      error instanceof Error && !error.cause
        ? error.message
        : "Local fixture seeding failed. Check database access, migrations and GCP credentials.",
    );
    process.exitCode = 1;
  });
}
