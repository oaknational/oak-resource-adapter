import type {
  RuleConfig,
  RuleConfigValue,
  RuleDescription,
  RuleInput,
} from "@oaknational/resource-adapter-dev-api-contracts";

const READS_LABELS = {
  adaptation: "Work so far",
  lesson: "Lesson",
  resource: "Resource",
  teacher: "Teacher",
} as const satisfies Record<RuleInput, string>;

const SAME_EVERYWHERE = "Same everywhere";

export function readsLabels({ reads }: Pick<RuleDescription, "reads">): string[] {
  return reads.length === 0
    ? [SAME_EVERYWHERE]
    : reads.map((input) => READS_LABELS[input]);
}

export function sentenceCase(key: string): string {
  const words = key
    .replaceAll(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll(/[-_]/g, " ")
    .toLowerCase();
  return `${words.charAt(0).toUpperCase()}${words.slice(1)}`;
}

export type ConfigValueDisplay =
  | Readonly<{ kind: "group"; lines: readonly ConfigLine[] }>
  | Readonly<{ kind: "list"; items: readonly string[] }>
  | Readonly<{ kind: "text"; text: string }>;

export type ConfigLine = Readonly<{
  key: string;
  label: string;
  value: ConfigValueDisplay;
}>;

function displayValue(value: RuleConfigValue): ConfigValueDisplay {
  if (Array.isArray(value)) {
    return {
      kind: "list",
      items: value.map((item: RuleConfigValue) =>
        typeof item === "object" && item !== null ? JSON.stringify(item) : String(item),
      ),
    };
  }
  if (value === null) {
    return { kind: "text", text: "None" };
  }
  if (typeof value === "object") {
    return { kind: "group", lines: configLines(value as RuleConfig) };
  }
  return { kind: "text", text: String(value) };
}

export function configLines(config: RuleConfig): readonly ConfigLine[] {
  return Object.entries(config).map(([key, value]) => ({
    key,
    label: sentenceCase(key),
    value: displayValue(value),
  }));
}
