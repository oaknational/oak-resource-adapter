"use client";

import type { ComponentType } from "react";

import type { ResourceAdapterCapabilityId } from "../publicTypes.js";
import {
  WorksheetAdapterWorkflow,
  type WorksheetAdapterWorkflowProps,
} from "./worksheet-adapter/WorksheetAdapterWorkflow.js";

export type CapabilityWorkflowProps = WorksheetAdapterWorkflowProps;

export const capabilityWorkflows = {
  worksheetAdapter: WorksheetAdapterWorkflow,
} satisfies Record<ResourceAdapterCapabilityId, ComponentType<CapabilityWorkflowProps>>;
