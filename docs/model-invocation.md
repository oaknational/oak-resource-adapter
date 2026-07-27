# Model invocation

`@oaknational/resource-adapter-ai` is the server-side entry point for invoking
AI models. It separates the stable role used by generation code from the
physical model and route used to fulfil the request.

The package is currently infrastructure only. It contains no production model
routes, provider clients, credentials, or network calls.

## Vocabulary

- A **role** is the stable, application-facing reason for a call, such as
  `quick-classifier`.
- A **model** is the physical provider model ID selected for a role, drawn from
  the supported catalogue in `packages/ai/src/model-catalogue.ts`.
- A **provider** owns or serves the model, such as OpenAI, Anthropic, or an
  internal service. It is derived from the model, never declared per route.
- A **transport** is how the invocation reaches that provider, such as a
  direct client, Helicone, or another gateway.
- A **protocol** is the request and response shape used by a transport.

Pipeline code selects a role, never a physical model or gateway. Changing a
model therefore changes the central route map; changing a gateway changes the
transport configuration.

Only `packages/ai/src/protocol.ts` imports the OpenAI SDK. However, adopting a
provider that is not OpenAI-compatible would mean revisiting call sites rather
than only this boundary.

## Supported models

`model-catalogue.ts` holds the closed set of models this service may invoke.

## Defining and invoking models

```ts
// examples
const models = defineModelRoutes({
  "quick-classifier": {
    model: "gpt-5.4-2026-03-05", // must be one of our SUPPORTED_MODELS
    transport: "primary",
  },
});

const ai = createModelInvoker({
  models,
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

The default error handler reports only the lifecycle stage and whether the
thrown value was an `Error`, without attaching the raw recorder error as a
cause. A custom `onRecorderError` receives that raw error and therefore owns its
redaction. If a custom handler throws, the invoker reports a sanitised handler
failure and preserves the original invocation outcome.

Recorders may receive prompt and response content and are responsible for
applying retention and redaction rules.

## Safety and orchestration

Threat detection and response moderation are higher-level orchestration
concerns rather than implicit model-invocation middleware:

```text
threat detection -> model invocation -> response moderation -> domain validation
```
