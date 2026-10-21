import { z } from "zod";

import { resourceDocumentInputSchema, type WithResourceDocument } from "./requests.js";

export const docxExportRequestSchema = z.strictObject({
  document: resourceDocumentInputSchema,
  embedFigures: z.boolean().default(true),
});

export type DocxExportRequest = WithResourceDocument<
  z.input<typeof docxExportRequestSchema>
>;
