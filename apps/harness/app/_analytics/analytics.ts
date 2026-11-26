import type {
  LessonAiMenuAnalyticsEvent,
  ResourceAdapterAnalyticsEvent,
} from "@oaknational/resource-adapter";
import type { PostHog } from "posthog-js";

type HarnessAnalyticsEvent = LessonAiMenuAnalyticsEvent | ResourceAdapterAnalyticsEvent;

type EventProperty<Event> = Event extends unknown
  ? Exclude<keyof Event, "name">
  : never;

const propertyNames = {
  accessTier: "Access Tier",
  accountState: "Account State",
  adaptationId: "Adaptation Id",
  allowanceLimit: "Allowance Limit",
  allowanceRemaining: "Allowance Remaining",
  attemptId: "Attempt Id",
  capabilityId: "Capability Id",
  componentType: "Component Type",
  format: "Format",
  jobId: "Job Id",
  jobKind: "Job Kind",
  limitKind: "Limit Kind",
  packageVersion: "Package Version",
  requestAction: "Request Action",
  retryTarget: "Retry Target",
  reviewAction: "Review Action",
  startMode: "Start Mode",
  suggestionCount: "Suggestion Count",
  supportLevel: "Support Level",
  teachingMaterialType: "Teaching Material Type",
  transformationKind: "Transformation Kind",
  transformationKinds: "Transformation Kinds",
} satisfies Record<EventProperty<HarnessAnalyticsEvent>, string>;

const engagementIntent = {
  "Lesson AI Menu Opened": "explore",
  "Teaching Materials Selected": "explore",
  "About Oak AI Selected": "explore",
  "Adapt Onboarding Selected": "explore",
  "Resource Adapter Opened": "explore",
  "Resource Adapter Closed": "explore",
  "Adaptation Started": "use",
  "Adaptation Restart Requested": "use",
  "Suggestions Displayed": "explore",
  "New Suggestions Requested": "use",
  "Suggestion Dismissal Requested": "refine",
  "Transformation Requested": "use",
  "Transformation Review Requested": "use",
  "Transformation Reviewed": "use",
  "Transformation Preview Displayed": "explore",
  "Transformation Removal Requested": "refine",
  "Adaptation Step Failed": "use",
  "Adaptation Request Failed": "use",
  "Adapted Resource Downloaded": "use",
  "Original Resource Downloaded": "use",
  "Usage Limit Reached": "use",
  "Monthly Allowance Displayed": "explore",
} satisfies Record<HarnessAnalyticsEvent["name"], string>;

export function toPostHogProperties(event: HarnessAnalyticsEvent) {
  const properties: Record<string, unknown> = {
    "Analytics Use Case": "Teacher",
    Platform: "harness",
    Product: "resource adapter",
    "Event Version": "2.0.0",
    "Engagement Intent": engagementIntent[event.name],
  };
  for (const [key, value] of Object.entries(event)) {
    if (Object.hasOwn(propertyNames, key)) {
      properties[propertyNames[key as keyof typeof propertyNames]] = value;
    }
  }
  return properties;
}

type AnalyticsClient = Pick<PostHog, "init" | "capture" | "identify" | "reset">;

type AnalyticsConfig = Readonly<{
  apiKey: string;
  environment: string;
  release: string;
  isAutomated: () => boolean;
}>;

export function createHarnessAnalytics(
  posthog: AnalyticsClient,
  config: AnalyticsConfig,
) {
  let initialised = false;
  let identifiedUser: string | null | undefined;

  function getPostHogClient() {
    if (config.apiKey === "") return null;
    if (!initialised) {
      posthog.init(config.apiKey, {
        api_host: "https://eu.i.posthog.com",
        // DOM capture can include worksheet content; remote settings must not enable it.
        autocapture: false,
        capture_dead_clicks: false,
        capture_exceptions: false,
        capture_heatmaps: false,
        capture_performance: false,
        capture_pageleave: false,
        capture_pageview: false,
        disable_session_recording: true,
        disable_surveys: true,
        person_profiles: "identified_only",
        // PostHog otherwise drops WebDriver events before before_send can tag them.
        opt_out_useragent_filter: true,
        before_send: (event) => ({
          ...event,
          properties: {
            ...event.properties,
            Environment: config.environment,
            Release: config.release,
            "Automated Run": config.isAutomated(),
          },
        }),
      });
      initialised = true;
    }
    return posthog;
  }

  function identify(userId: string | null | undefined) {
    if (userId === undefined) return;
    const client = getPostHogClient();
    if (client === null || userId === identifiedUser) return;
    if ((identifiedUser !== undefined && identifiedUser !== null) || userId === null)
      client.reset();
    if (userId !== null) client.identify(userId);
    identifiedUser = userId;
  }

  function capture(event: HarnessAnalyticsEvent) {
    getPostHogClient()?.capture(event.name, toPostHogProperties(event));
  }

  return { identify, capture };
}
