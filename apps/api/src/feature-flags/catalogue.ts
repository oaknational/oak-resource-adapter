/** GitHub handle of one person, never a team or a distribution list. */
type FeatureFlagOwner = `@${string}`;

type FeatureFlagCatalogueEntry = Readonly<{
  purpose: string;
  owner: FeatureFlagOwner;
  default: boolean;
}>;

export const featureFlagCatalogue = {
  "feature-flags-smoke-test-enabled": {
    purpose: "Verifies feature-flag evaluation wiring across environments.",
    owner: "@jbr90",
    default: false,
  },
} as const satisfies Readonly<Record<string, FeatureFlagCatalogueEntry>>;

export type FeatureFlagKey = keyof typeof featureFlagCatalogue;
