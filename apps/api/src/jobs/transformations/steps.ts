import {
  executeRemoveTransformation,
  executeRetryTransformation,
  executeDismissTransformations,
} from "../../worksheet-scaffolding/execution";

export async function executeRemoveTransformationStep(jobId: string): Promise<void> {
  "use step";

  await executeRemoveTransformation(jobId);
}

export async function executeRetryTransformationStep(jobId: string): Promise<void> {
  "use step";

  await executeRetryTransformation(jobId);
}

export async function executeDismissTransformationsStep(jobId: string): Promise<void> {
  "use step";

  await executeDismissTransformations(jobId);
}
