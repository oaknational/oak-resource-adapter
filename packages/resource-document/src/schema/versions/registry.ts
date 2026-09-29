import { defineSchemaVersions } from "../../versioning.js";
import { resourceDocumentV0_1Schema } from "./v0_1/schemas.js";

export const resourceDocumentSchemaVersions = defineSchemaVersions({
  order: ["0.1"],
  schemas: { "0.1": resourceDocumentV0_1Schema },
}).withUpgrades({});
