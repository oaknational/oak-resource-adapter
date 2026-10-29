import {
  jobResponseSchema,
  modelInvocationResponseSchema,
  moderationSmokeResponseSchema,
  storageRoundTripResponseSchema,
  type JobResponse,
  type ModelInvocationRequest,
  type ModelInvocationResponse,
  type ModerationSmokeCase,
  type ModerationSmokeRequest,
  type ModerationSmokeResponse,
  type StorageRoundTripFailure,
  type StorageRoundTripSuccess,
  type TestJobRequest,
} from "@oaknational/resource-adapter-dev-api-contracts";
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

export async function readApiJson<TSchema extends z.ZodType>(
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

/** Dev routes report a failure as `{ error }`; anything else falls back to the status. */
export async function readApiError(response: Response): Promise<Error> {
  const parsed = z
    .object({ error: z.string() })
    .safeParse(await response.json().catch(() => null));
  return new Error(
    parsed.success ? parsed.data.error : `The API returned HTTP ${response.status}.`,
  );
}

export async function readApiResponse<TSchema extends z.ZodType>(
  response: Response,
  schema: TSchema,
  what: string,
): Promise<z.infer<TSchema>> {
  if (!response.ok) {
    throw await readApiError(response);
  }
  return readApiJson(response, schema, what);
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

  const readiness = await readApiJson(response, readinessResponseSchema, "readiness");
  if ((response.status === 200) !== (readiness.status === "ready")) {
    throw new Error("The readiness response is inconsistent.");
  }

  return readiness;
}

export async function createTestJob(): Promise<JobResponse> {
  const request: TestJobRequest = { message: "Hello from the harness" };
  const response = await fetch(`${adapterProxyPath}/dev/jobs/test-echo`, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readApiJson(response, jobResponseSchema, "a test job");
}

export async function readTestJob(
  id: string,
  signal: AbortSignal,
): Promise<JobResponse> {
  const response = await fetch(`${adapterProxyPath}/dev/jobs/${id}`, { signal });

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readApiJson(response, jobResponseSchema, "a test job");
}

export class StorageRoundTripFailed extends Error {
  readonly failure: StorageRoundTripFailure;

  constructor(failure: StorageRoundTripFailure) {
    super(failure.message);
    this.name = "StorageRoundTripFailed";
    this.failure = failure;
  }
}

export async function roundTripStorage(): Promise<StorageRoundTripSuccess> {
  const response = await fetch(`${adapterProxyPath}/dev/storage/roundtrip`, {
    method: "POST",
  });

  if (response.status === 404) {
    throw new Error("Dev routes are not enabled on the API.");
  }

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  const roundTrip = await readApiJson(
    response,
    storageRoundTripResponseSchema,
    "a storage round trip",
  );

  if (roundTrip.status === "failed") {
    throw new StorageRoundTripFailed(roundTrip);
  }

  return roundTrip;
}

export async function invokeModel(): Promise<ModelInvocationResponse> {
  const request: ModelInvocationRequest = { input: "Reply with the single word: pong" };
  const response = await fetch(`${adapterProxyPath}/dev/ai/invoke`, {
    body: JSON.stringify(request),
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

  return readApiJson(response, modelInvocationResponseSchema, "a model invocation");
}

export async function moderateContent(
  smokeCase: ModerationSmokeCase,
): Promise<ModerationSmokeResponse> {
  const request: ModerationSmokeRequest = { case: smokeCase };
  const response = await fetch(`${adapterProxyPath}/dev/moderation/moderate`, {
    body: JSON.stringify(request),
    headers: { "Content-Type": "application/json" },
    method: "POST",
  });

  if (response.status === 404) {
    throw new Error("Dev routes are not enabled on the API.");
  }

  if (response.status === 503) {
    throw new Error("The API has no moderation service URL configured.");
  }

  if (!response.ok) {
    throw new Error(`The API returned HTTP ${response.status}.`);
  }

  return readApiJson(response, moderationSmokeResponseSchema, "a moderation result");
}
