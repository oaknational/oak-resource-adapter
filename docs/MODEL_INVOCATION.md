# Model invocation

`@oaknational/resource-adapter-ai` is the server-side boundary for model calls.
Application code selects a role; configuration binds that role to a supported
model and transport. Provider clients, credentials, and production bindings live
outside the package.

A **role** is the stable, application-facing reason for a call. A **model** is a
physical model ID from the closed catalogue in `model-catalogue.ts`, and its
**provider** is derived from that model rather than declared per binding. A
**transport** is how the call reaches the provider: a direct client, Helicone, or
another gateway. Changing the model behind a role is a binding change; changing
the gateway is a transport change.

Requests are initially OpenAI-compatible. Provider requests and responses,
output states, and operational errors are normalised at the transport seam, so
call sites do not depend on a particular SDK. A provider with a different input
shape may eventually require a neutral request protocol too.

## Invoking models

```ts
const roleBindings = defineRoleBindings({
  "quick-classifier": {
    model: "gpt-5.6-luna",
    transport: "primary",
  },
});

const ai = createModelInvoker({
  recorder: invocationRecorder,
  roleBindings,
  transports: { primary: modelTransport },
});

const result = await ai.invokeText({
  correlationKey: workflowStepId,
  request: {
    instructions: "Classify the resource.",
    input: resourceText,
  },
  role: "quick-classifier",
  signal: jobSignal,
});

if (result.outcome === "SUCCESS") {
  console.log(result.output);
}
```

`invokeText` is the common case. `invoke` exposes the lower-level normalised
response. `correlationKey` is audit metadata and grants no idempotency.

## Structured outputs

`invokeStructured` infers its success type from a Zod schema and validates the
provider output again inside the package:

```ts
const classification = z.object({
  confidence: z.number().min(0).max(1),
  resourceType: z.enum(["slide-deck", "worksheet"]),
});

const result = await ai.invokeStructured({
  request: {
    instructions: "Classify the resource.",
    input: resourceText,
  },
  role: "quick-classifier",
  schema: classification,
  schemaName: "resource_classification",
});

switch (result.outcome) {
  case "SUCCESS":
    result.output.resourceType;
    break;
  case "STRUCTURED_OUTPUT_FAILURE":
    // INVALID_JSON or SCHEMA_MISMATCH
    break;
  case "REFUSAL":
  case "INCOMPLETE":
  case "OUTPUT_MISSING":
    break;
}
```

Schemas are object-wrapped internally, so primitives and unions are supported.
Each transport converts Zod to its provider's schema dialect. An unsupported
schema fails with `INVALID_CONFIGURATION` before a request is recorded or sent.

Refusals, incomplete or missing output, and validation failures are branchable
outcomes. Operational failures throw `ModelInvocationError`; its stable `code`
and derived `retryable` flag are safe to handle outside the package, while raw
provider details remain on `cause`.

Every convenience-method result carries `meta`: the invocation ID to join against
`model_invocations`, plus the provider response ID and usage where available.
Structured responses
are recorded with `VALID`, `INVALID_JSON`, or `SCHEMA_MISMATCH`; other responses
have no validation status.

## Cancellation and timeouts

Every invocation has a timeout, set globally with `defaultTimeoutMs` or per call
with `timeoutMs`. A caller signal is composed with it, and transports must forward
the resulting signal to their client. The timeout starts after `recordStarted`,
so recorder latency does not consume the provider-call budget.

## Prompt templates

Templates are defined in source. Their placeholders become the required keys of
the variables argument, and rendering rejects missing or unused variables.

```ts
const LOWER_READING_AGE = definePromptTemplate({
  identifier: "lower-reading-age",
  template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}",
  version: 1,
});

const prompt = await preparePrompt({
  template: LOWER_READING_AGE,
  variables: { readingAge: "9", text: sourceText },
});

await ai.invokeText({
  promptTemplateId: prompt.promptTemplateId,
  request: { input: prompt.text },
  role: "rewriter",
});
```

`preparePrompt` renders and registers a template on first use. Change the
version whenever the body changes; reusing an identifier and version with a new
body is rejected. `renderPromptTemplate` renders without registration.

## Persistence

`createDatabaseInvocationRecorder({ transformationAttemptId })` writes model
calls to `model_invocations`. It inserts before the provider call and updates on
completion, so an abandoned call remains visible with `completed_at = null`.
Failure rows store classified error metadata rather than potentially sensitive
provider messages.

One row represents one application-level invocation. An application retry is a
new row; retries made internally by a provider client remain within the original
row. Raw provider responses, response IDs, token usage, and structured-output
validation status are retained when available.

The invoker fails closed if `recordStarted` fails, preventing an unrecorded model
call. Failures from `recordSucceeded` or `recordFailed` are instead sent to
`onRecorderError`, so a recorder fault cannot hide a paid response or provider
error. Recorders receive prompt and response content and must apply appropriate
retention and redaction.

## Adding a transport

```ts
interface ModelTransport {
  prepare(
    invocation: ModelTransportInvocation,
    output: ModelOutputRequirement,
  ): {
    request: ModelProviderRequest;
    execute(options: ModelTransportOptions): Promise<ModelTransportResult>;
  };
}
```

`prepare` converts the logical invocation into the exact serialisable provider
request without sending it. The invoker records that request before calling
`execute`. A terminal provider failure is returned with its response data;
failures without a normal provider response are thrown.

`createOpenAIResponsesTransport` can be configured with direct OpenAI or a
compatible gateway client. It defaults `store` to `false`; callers using
`previous_response_id` must explicitly enable provider-side retention.

Threat detection and response moderation belong in orchestration around this
boundary, not inside the transport.
