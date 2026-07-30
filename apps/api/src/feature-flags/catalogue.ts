/** GitHub handle of one person, never a team or a distribution list. */
type FeatureFlagOwner = `@${string}`;

type FeatureFlagCatalogueEntry = Readonly<{
  purpose: string;
  owner: FeatureFlagOwner;
  default: boolean;
}>;

export const featureFlagCatalogue = {
  "capabilities-smoke-test": {
    purpose: "Proves PostHog evaluation for unit tests.",
    owner: "@jbr90",
    default: false,
  },
} as const satisfies Readonly<Record<string, FeatureFlagCatalogueEntry>>;

export type FeatureFlagKey = keyof typeof featureFlagCatalogue;
