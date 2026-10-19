import { pathToFileURL } from "node:url";
import { parseArgs } from "node:util";

const usage = `Usage:
  pnpm access:grant <clerkUserId>                               Give full access
  pnpm access:grant <clerkUserId> --revoke                      Remove full access
  pnpm access:grant <clerkUserId> --model-jobs-per-24h <n>      Set the daily limit
  pnpm access:grant <clerkUserId> --model-jobs-per-24h default  Use the default daily limit

Runs against the Clerk instance that CLERK_SECRET_KEY belongs to.`;

export class UsageError extends Error {}

function parseModelJobsPer24h(value) {
  if (value === "default") {
    return null;
  }
  const limit = Number(value);
  if (!/^\d+$/.test(value) || !Number.isSafeInteger(limit) || limit < 1) {
    throw new UsageError("--model-jobs-per-24h takes a positive integer or default.");
  }
  return limit;
}

/** Clerk deep-merges `privateMetadata`, and a null removes its key. */
export function parseAccessArguments(args) {
  const { positionals, values } = parseArgs({
    args,
    allowPositionals: true,
    options: {
      "model-jobs-per-24h": { type: "string" },
      revoke: { type: "boolean" },
    },
  });
  const [userId, ...extra] = positionals;
  if (userId === undefined || extra.length > 0 || !/^user_\w+$/.test(userId)) {
    throw new UsageError("Give one Clerk user ID, such as user_2abc.");
  }
  const modelJobsPer24h = values["model-jobs-per-24h"];
  const ora = {};
  if (values.revoke) {
    ora.access = null;
  } else if (modelJobsPer24h === undefined) {
    ora.access = "full";
  }
  if (modelJobsPer24h !== undefined) {
    ora.usageLimits = { modelJobsPer24h: parseModelJobsPer24h(modelJobsPer24h) };
  }
  return { privateMetadata: { ora }, userId };
}

export function clerkInstance(secretKey) {
  if (secretKey?.startsWith("sk_test_")) {
    return "development";
  }
  if (secretKey?.startsWith("sk_live_")) {
    return "production";
  }
  throw new UsageError("CLERK_SECRET_KEY must be set to a Clerk secret key.");
}

export async function grantAccess(
  args,
  { env = process.env, fetch = globalThis.fetch, log = console.log } = {},
) {
  const { privateMetadata, userId } = parseAccessArguments(args);
  const instance = clerkInstance(env.CLERK_SECRET_KEY);
  const response = await fetch(`https://api.clerk.com/v1/users/${userId}/metadata`, {
    body: JSON.stringify({ private_metadata: privateMetadata }),
    headers: {
      Authorization: `Bearer ${env.CLERK_SECRET_KEY}`,
      "Content-Type": "application/json",
    },
    method: "PATCH",
  });
  const body = await response.json();
  if (!response.ok) {
    throw new Error(
      `Clerk refused the update (${response.status}): ${body.errors?.[0]?.message ?? "no message"}`,
    );
  }
  log(
    `Updated ${userId} on the ${instance} Clerk instance. ORA metadata: ${JSON.stringify(body.private_metadata?.ora ?? {})}`,
  );
  log(
    "ORA applies it straight away to anything it would otherwise refuse, and everywhere else within 10 minutes.",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    await grantAccess(process.argv.slice(2));
  } catch (error) {
    console.error(error instanceof UsageError ? `${error.message}\n\n${usage}` : error);
    process.exitCode = 1;
  }
}
