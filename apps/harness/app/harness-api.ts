import { z } from "zod";

export const adapterProxyPath = "/adapter-proxy";

/**
 * Everything the harness sends goes through its own proxy route, which forwards
 * server-side to whichever API deployment this harness was paired with. One
 * build therefore works against any of them, and the API's bypass secret stays
 * out of the bundle.
 *
 * The package requires an absolute URL, so this builds one from the current
 * origin at run time rather than baking one in at build time.
 */
export function resolveApiBaseUrl(): string {
  // Prerendering needs a value that parses, not one that resolves.
  const origin =
    typeof window === "undefined" ? "http://localhost:3000" : window.location.origin;

  return `${origin}${adapterProxyPath}`;
}

const healthResponseSchema = z.object({ status: z.literal("ok") });

const readinessResponseSchema = z
  .object({
    status: z.enum(["ready", "not-ready"]),
    checks: z.record(
      z.string(),
      z.object({
        label: z.string().trim().min(1),
        status: z.enum(["ready", "not-ready"]),
        message: z.string().trim().min(1),
        code: z.string().optional(),
      }),
    ),
  })
  .refine(({ status, checks }) => {
    const values = Object.values(checks);
    return (
      values.length > 0 &&
      (status === "ready") === values.every((check) => check.status === "ready")
    );
  });

export type ApiReadiness = z.infer<typeof readinessResponseSchema>;

const testJobResponseSchema = z.object({
  // The dev routes are not a contract, so a field the harness only displays is
  // read leniently rather than failing the whole response.
  failure: z.object({ message: z.string() }).nullable().catch(null),
  id: z.string(),
  status: z.enum(["failed", "queued", "running", "succeeded"]),
});

export type TestJobResponse = z.infer<typeof testJobResponseSchema>;

const modelInvocationResponseSchema = z.object({
  outcome: z.enum(["INCOMPLETE", "OUTPUT_MISSING", "REFUSAL", "SUCCESS"]),
  outputText: z.string().nullable().catch(null),
  usage: z.object({ outputTokens: z.number() }).nullable().catch(null),
});

export type ModelInvocationResponse = z.infer<typeof modelInvocationResponseSchema>;

async function readJson<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  what: string,
): Promise<z.infer<TSchema>> {
  const parsed = schema.safeParse(await response.json());

  if (!parsed.success) {
    throw new Error(`The API returned ${what} in an unrecognised shape.`);
  }

  return parsed.data;
}

export async function fetchApiHealth(signal: AbortSignal): Promise<boolean> {
  const response = await fetch(`${adapterProxyPath}/health`, {
    cache: "no-store",
    signal,
  });

  if (!response.ok) {
    return false;
  }

  const parsed = healthResponseSchema.safeParse(await response.json());

  return parsed.success;
}

export async function fetchApiReadiness(signal: AbortSignal): Promise<ApiReadiness> {
  const response = await fetch(`${adapterProxyPath}/health/ready`, {
    cache: "no-store",
    signal,
  });

  if (response.status !== 200 && response.status !== 503) {
    throw new Error("The readiness endpoint is unavailable.");
  }

  const readiness = await readJson(response, readinessResponseSchema, "readiness");
  if ((response.status === 200) !== (readiness.status === "ready")) {
    throw new Error("The readiness response is inconsistent.");
  }

  return readiness;
}

export async function createTestJob(): Promise<TestJobResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/jobs/test-echo`, {
    body: JSON.stringify({ message: "Hello from the harness" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readJson(response, testJobResponseSchema, "a test job");
}

export async function readTestJob(
  id: string,
  signal: AbortSignal,
): Promise<TestJobResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/jobs/${id}`, { signal });

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readJson(response, testJobResponseSchema, "a test job");
}

const storageRoundTripResponseSchema = z.object({
  bucket: z.string(),
  byteSize: z.number(),
  environment: z.string(),
  federated: z.boolean(),
  key: z.string(),
  status: z.literal("ok"),
});

export type StorageRoundTripResponse = z.infer<typeof storageRoundTripResponseSchema>;

const storageFailureSchema = z.object({
  bucket: z.string().nullable().catch(null),
  cleanupMessage: z.string().nullable().catch(null),
  federated: z.boolean().nullable().catch(null),
  key: z.string().nullable().catch(null),
  message: z.string().trim().min(1),
});

export type StorageRoundTripFailure = z.infer<typeof storageFailureSchema>;

export class StorageRoundTripFailed extends Error {
  readonly failure: StorageRoundTripFailure;

  constructor(failure: StorageRoundTripFailure) {
    super(failure.message);
    this.name = "StorageRoundTripFailed";
    this.failure = failure;
  }
}

async function readFailure(
  response: Response,
): Promise<StorageRoundTripFailure | null> {
  const body: unknown = await response.json().catch(() => null);
  const failure = storageFailureSchema.safeParse(body);

  return failure.success ? failure.data : null;
}

export async function roundTripStorage(): Promise<StorageRoundTripResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/storage/roundtrip`, {
    method: "POST",
  });

  if (response.status === 404) {
    throw new Error("Dev routes are not enabled on the API.");
  }

  if (!response.ok) {
    const failure = await readFailure(response);

    if (failure) {
      throw new StorageRoundTripFailed(failure);
    }

    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readJson(response, storageRoundTripResponseSchema, "a storage round trip");
}

export async function invokeModel(): Promise<ModelInvocationResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/ai/invoke`, {
    body: JSON.stringify({ input: "Reply with the single word: pong" }),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (response.status === 404) {
    throw new Error("Dev routes are not enabled on the API.");
  }

  if (response.status === 503) {
    throw new Error("The API has no OpenAI API key configured.");
  }

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readJson(response, modelInvocationResponseSchema, "a model invocation");
}
