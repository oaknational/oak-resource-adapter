import {
  executeApplySuggestion,
  executeGenerateSuggestions,
} from "../../worksheet-scaffolding/execution";

export async function executeGenerateSuggestionsStep(jobId: string): Promise<void> {
  "use step";

  await executeGenerateSuggestions(jobId);
}

export async function executeApplySuggestionStep(jobId: string): Promise<void> {
  "use step";

  await executeApplySuggestion(jobId);
}
