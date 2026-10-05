import type { TransformationAvailabilityContext } from "./types";

export type AvailabilityRule = (context: TransformationAvailabilityContext) => boolean;

export const always: AvailabilityRule = () => true;
export const disabled: AvailabilityRule = () => false;

export function all(...rules: readonly AvailabilityRule[]): AvailabilityRule {
  return (context) => rules.every((rule) => rule(context));
}

/** For a transformation a teacher should be offered once per adaptation. */
export function notAlreadyApplied(kind: string): AvailabilityRule {
  return ({ appliedTransformations }) =>
    !appliedTransformations.some((transformation) => transformation.kind === kind);
}

/** For work that may be applied once to each target node. */
export function notAlreadyAppliedToTarget(kind: string): AvailabilityRule {
  return ({ appliedTransformations, targetBlockId }) =>
    !appliedTransformations.some(
      (transformation) =>
        transformation.kind === kind && transformation.targetBlockId === targetBlockId,
    );
}
