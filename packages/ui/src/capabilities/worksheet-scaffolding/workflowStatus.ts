import type {
  UsageLimitKind,
  UsageLimitReached,
  WorksheetScaffoldingJobKind,
  WorksheetScaffoldingState,
} from "@oaknational/resource-adapter-contracts/internal";

import { jobIsBusy } from "./workflowState.js";

export type WorkflowStatus = Readonly<{
  message: string;
  title?: string;
  tone: "info" | "neutral" | "warning" | "working";
}>;

export const LOADING_STATUS = {
  message: "Getting your worksheet ready.",
  title: "Loading worksheet",
  tone: "working",
} as const satisfies WorkflowStatus;

export const MONTHLY_RESET_STATUS = {
  message: "You can try starting this adaptation again.",
  title: "Your monthly allowance has reset",
  tone: "neutral",
} as const satisfies WorkflowStatus;

function suggestedSentence(count: number): string {
  if (count === 0) {
    return "There are no suggested scaffolds for this worksheet.";
  }
  if (count === 1) {
    return "There is one suggested scaffold for this worksheet.";
  }
  return `There are ${count} suggested scaffolds for this worksheet.`;
}

function addedSentence(count: number): string {
  if (count === 0) {
    return "";
  }
  return count === 1
    ? "One scaffold has been added."
    : `${count} scaffolds have been added.`;
}

function scaffoldStatusMessage(suggestedCount: number, addedCount: number): string {
  return [suggestedSentence(suggestedCount), addedSentence(addedCount)]
    .filter((sentence) => sentence !== "")
    .join(" ");
}

/** One entry per job kind, so a new kind cannot silently lose its progress status. */
const BUSY_STATUSES = {
  "suggestions.apply": {
    message: "Updating the worksheet with your chosen scaffold.",
    title: "Applying scaffold",
    tone: "working",
  },
  "suggestions.generate": {
    message: "Reviewing the worksheet for useful scaffolds.",
    title: "Considering scaffold selections for practice tasks",
    tone: "working",
  },
  "transformations.dismiss": {
    message: "Updating the worksheet's scaffold choices.",
    title: "Updating scaffold choices",
    tone: "working",
  },
  "transformations.remove": {
    message: "Updating the worksheet and finding new scaffold suggestions.",
    title: "Removing scaffold",
    tone: "working",
  },
  "transformations.retry": {
    message: "Creating another version of this scaffold.",
    title: "Trying scaffold again",
    tone: "working",
  },
} as const satisfies Record<WorksheetScaffoldingJobKind, WorkflowStatus>;

// Allowances refill at midnight UK time, so the UK date is the one to name.
export const ukDate = new Intl.DateTimeFormat("en-GB", {
  day: "numeric",
  month: "long",
  timeZone: "Europe/London",
});

const localDateTime = new Intl.DateTimeFormat("en-GB", {
  dateStyle: "medium",
  timeStyle: "short",
});

const LIMIT_STATUSES = {
  adapted_resources_month: {
    message: (retryAt: Date) =>
      `You can start a new adaptation on ${ukDate.format(retryAt)}.`,
    title: "You've used this month's adaptations",
  },
  model_jobs_24h: {
    message: (retryAt: Date) =>
      `You can add scaffolds again after ${localDateTime.format(retryAt)}.`,
    title: "You've reached your fair usage limit",
  },
} as const satisfies Record<
  UsageLimitKind,
  Readonly<{ message: (retryAt: Date) => string; title: string }>
>;

export function usageLimitStatus({ kind, retryAt }: UsageLimitReached): WorkflowStatus {
  return {
    message: LIMIT_STATUSES[kind].message(new Date(retryAt)),
    title: LIMIT_STATUSES[kind].title,
    tone: "warning",
  };
}

export const FAILURE_TITLES = {
  "suggestions.apply": "We couldn't apply that scaffold",
  "suggestions.generate": "We couldn't find scaffolds",
  "transformations.dismiss": "We couldn't update your scaffold choices",
  "transformations.remove": "We couldn't remove that scaffold",
  "transformations.retry": "We couldn't try that scaffold again",
} as const satisfies Record<WorksheetScaffoldingJobKind, string>;

export function failureMessage(
  kind: WorksheetScaffoldingJobKind,
  canKeepScaffolds: boolean,
): string {
  if (kind === "transformations.retry") {
    return "You can retry again, accept this version, undo it, or start again.";
  }
  if (canKeepScaffolds) {
    return "Try again to keep the scaffolds you have added, or start again to reopen the original worksheet.";
  }
  return "Start again to reopen the original worksheet.";
}

export function foundNoScaffolds(
  state: WorksheetScaffoldingState,
  suggestedCount: number,
): boolean {
  return (
    suggestedCount === 0 &&
    state.job?.kind === "suggestions.generate" &&
    state.job.status === "succeeded"
  );
}

export function readyStatus(
  state: WorksheetScaffoldingState,
  suggestedCount: number,
  addedCount: number,
  hasLocalProgress: boolean,
): WorkflowStatus | null {
  // A spinner beside the chosen suggestion reports that application itself, so the
  // banner keeps the standing summary rather than repeating the same progress.
  const reportedLocally = hasLocalProgress && state.job?.kind === "suggestions.apply";
  if (state.job !== null && jobIsBusy(state) && !reportedLocally) {
    return BUSY_STATUSES[state.job.kind];
  }
  if (state.modelWorkBlocked !== null) {
    return usageLimitStatus(state.modelWorkBlocked);
  }
  if (state.job?.status === "failed") {
    return null;
  }
  if (suggestedCount > 0 || addedCount > 0) {
    return {
      message: scaffoldStatusMessage(suggestedCount, addedCount),
      tone: "info",
    };
  }
  if (foundNoScaffolds(state, suggestedCount)) {
    return {
      message:
        "We didn't find a useful scaffold for this worksheet. It may already give pupils the support they need.",
      title: "No scaffolds suggested",
      tone: "neutral",
    };
  }
  return null;
}
