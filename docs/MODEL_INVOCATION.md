# Model invocation

`@oaknational/resource-adapter-ai` is the server-side entry point for invoking
AI models. It separates the stable role used by generation code from the
physical model and transport used to fulfil the request.

The package contains no production model role bindings, provider clients,
credentials, or network calls. It does own prompt templates and invocation
persistence, described below.

## Vocabulary

- A **role** is the stable, application-facing reason for a call, such as
  `quick-classifier`.
- A **model** is the physical provider model ID selected for a role, drawn from
  the supported catalogue in `packages/ai/src/model-catalogue.ts`.
- A **provider** owns or serves the model, such as OpenAI, Anthropic, or an
  internal service. It is derived from the model, never declared per binding.
- A **transport** is how the invocation reaches that provider, such as a
  direct client, Helicone, or another gateway.
- A **protocol** is the request and response shape used by a transport.

Pipeline code selects a role, never a physical model or gateway. Changing a
model therefore changes the role bindings; changing a gateway changes the
transport configuration.

Only `packages/ai/src/protocol.ts` imports the OpenAI SDK. However, adopting a
provider that is not OpenAI-compatible would mean revisiting call sites rather
than only this boundary.

## Supported models

`model-catalogue.ts` holds the closed set of models this service may invoke.

## Binding roles and invoking models

```ts
// examples
const roleBindings = defineRoleBindings({
  "quick-classifier": {
    model: "gpt-5.4-2026-03-05", // must be one of our SUPPORTED_MODELS
    transport: "primary",
  },
});

const ai = createModelInvoker({
  roleBindings,
  recorder: invocationRecorder,
  transports: {
    primary: modelTransport,
  },
});

const response = await ai.invoke({
  correlationKey: workflowStepId,
  request: {
    instructions: "Classify the resource.",
    input: resourceText,
  },
  role: "quick-classifier",
  signal: jobSignal,
});
```

## Cancellation and timeouts

Every invocation receives a timeout signal, defaulting to `DEFAULT_TIMEOUT_MS`
and overridable per invoker (`defaultTimeoutMs`) or per call (`timeoutMs`).
Timeouts must be positive integers no greater than `2_147_483_647`
milliseconds; invalid defaults fail when the invoker is created, and invalid
per-call values fail before an invocation is recorded.
Because requests are non-streaming, latency scales with output length: long-form
generation roles should raise `timeoutMs` rather than assume the default fits.
A caller-supplied signal and the timeout can both abort the same invocation,
whichever fires first.

Transports always receive a signal and must forward it to their underlying
client.

## CorrelationKey

`correlationKey` ties an invocation back to the unit of work that caused it,
such as a workflow step ID, so recorded spend can be traced to its origin.

It grants no idempotency.

## Prompt templates

A template is defined in source and identified by its content:

```ts
const LOWER_READING_AGE = definePromptTemplate({
  identifier: "lower-reading-age",
  template: "Rewrite for reading age {{readingAge}}.\n\n{{text}}",
  version: 1,
});
```

The body is the single source of truth for its variables: its placeholders
become the required keys of the `variables` argument, so a template and its call
sites cannot drift apart unnoticed. Rendering is strict in both directions — a
missing variable and an unused one both throw.

`preparePrompt` renders the template and registers it in one step, returning the
text to send and the ID to record against the invocation:

```ts
const prompt = await preparePrompt({
  template: LOWER_READING_AGE,
  variables: { readingAge: "9", text: sourceText },
});

const response = await ai.invoke({
  promptTemplateId: prompt.promptTemplateId,
  request: { input: prompt.text },
  role: "rewriter",
});
```

### Versioning

`version` must be bumped whenever a body changes. Editing a body while leaving
its version alone is refused on first use, with a bump-the-version error, because
`prompt_templates` is unique on identifier and version.

Templates are registered on first use and reused by hash thereafter. Only
templates that were actually used reach the database; one defined in source but
never invoked is never stored.

`renderPromptTemplate` renders without registering, for a preview that is never
sent to a model.

## Persisting invocations

`createDatabaseInvocationRecorder` writes each physical call to
`model_invocations`. It is scoped to one transformation attempt:

```ts
const ai = createModelInvoker({
  roleBindings,
  recorder: createDatabaseInvocationRecorder({ transformationAttemptId }),
  transports,
});
```

The attempt is fixed for the lifetime of the work being recorded, so it is
configured once rather than passed per call — the invoker never learns that
persistence is attempt-shaped. Only `promptTemplateId`, which varies between
calls within an attempt, travels on the invocation itself.

The row is written in two steps: an insert before the provider call, then an
update to complete it. An invocation abandoned mid-flight therefore still leaves
a row with a null `completed_at`. Retries are not deduplicated, because a
retried step is a second paid call and must read as a second row.

## Adding a transport

A transport implements one method:

```ts
interface ModelTransport {
  invoke(
    invocation: ResolvedModelInvocation,
    options: ModelTransportOptions,
  ): Promise<ModelInvocationResponse>;
}
```

A gateway-specific implementation is only needed when it has meaningfully
different behaviour. Direct OpenAI and an OpenAI-compatible gateway should share
one future Responses transport configured with different clients, base URLs,
and headers.

## Invocation recording

The invoker reports started, succeeded, and failed lifecycle events through an
`InvocationRecorder`. `ResolvedModelInvocation` is plain, serialisable data so a
recorder can persist it directly.

Recording is observability and does not change the outcome of a call. If
`recordSucceeded` or `recordFailed` throws, the error is routed to
`onRecorderError` — a broken recorder never discards a paid-for response or
masks a provider error. `recordStarted` is an exception: it fails
closed, so a recorder outage prevents the call.

Recorders may receive prompt and response content and are responsible for
applying retention and redaction rules.

## Safety and orchestration

Threat detection and response moderation are higher-level orchestration
concerns rather than implicit model-invocation middleware:

```text
threat detection -> model invocation -> response moderation -> domain validation
```
