export class TransformationRequestError extends Error {
  override readonly name = "TransformationRequestError";
}

export class TransformationDependencyError extends Error {
  override readonly name = "TransformationDependencyError";
}
