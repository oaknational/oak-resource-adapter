import { configuredLimit } from "./configured-limit";

const DEFAULT_ADAPTED_RESOURCES_PER_MONTH = 3;

export function adaptedResourcesPerMonthLimit(configured: string | undefined): number {
  return configuredLimit(
    "USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH",
    configured,
    DEFAULT_ADAPTED_RESOURCES_PER_MONTH,
  );
}
