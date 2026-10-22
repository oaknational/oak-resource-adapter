// Response schemas strip fields they do not recognise, so an additive API change
// cannot break the harness. Request schemas are strict. Resource documents are
// the exception in responses: they are validated against the canonical schema,
// because the harness reuses a run's output and must not drop content.

export * from "./ai.js";
export * from "./exports.js";
export * from "./jobs.js";
export * from "./oak-material.js";
export * from "./storage.js";
export * from "./suggestions.js";
export * from "./transformations.js";
