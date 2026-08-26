"use client";

import type { ComponentType } from "react";

import type { ResourceAdapterCapabilityId } from "../publicTypes.js";
import {
  WorksheetScaffoldingWorkflow,
  type WorksheetScaffoldingWorkflowProps,
} from "./worksheet-scaffolding/WorksheetScaffoldingWorkflow.js";

export type CapabilityWorkflowProps = WorksheetScaffoldingWorkflowProps;

export const capabilityWorkflows = {
  worksheetScaffolding: WorksheetScaffoldingWorkflow,
} satisfies Record<ResourceAdapterCapabilityId, ComponentType<CapabilityWorkflowProps>>;
