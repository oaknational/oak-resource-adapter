import type {
  Response,
  ResponseCreateParamsNonStreaming,
} from "openai/resources/responses/responses";

/**
 * A non-streaming model request. The logical model role is resolved to a
 * physical model separately, so callers cannot set `model` or enable streaming.
 *
 * NB: Swapping to a non-OpenAI-compatible provider would mean revisiting call sites
 *
 * Per-call controls such as cancellation are not part of this type; they are
 * passed separately so that a recorded invocation stays serialisable.
 */
export type ModelInvocationRequest = Omit<
  ResponseCreateParamsNonStreaming,
  "model" | "stream"
>;

/**
 * The initial model response protocol.
 *
 * This is intentionally an internal alias rather than a re-export of the
 * OpenAI SDK type, so a future normalisation layer can replace this boundary
 * without spreading provider imports through the application.
 */
export type ModelInvocationResponse = Response;
