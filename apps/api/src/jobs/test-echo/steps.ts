import { FatalError } from "workflow";

import { getJob } from "../job-repository";
import { testEchoJob } from "./definition";

export async function executeTestEchoStep(jobId: string): Promise<void> {
  "use step";

  const job = await getJob(jobId);
  if (!job || job.kind !== testEchoJob.kind) {
    throw new FatalError("The test echo job does not exist or has the wrong kind.");
  }

  testEchoJob.input.parse(job.input);
}
