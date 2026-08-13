import type { ResourceDocument } from "../schema/current.js";

export type ResourceMarkupParseResult =
  | { success: true; data: ResourceDocument }
  | {
      success: false;
      error: import("../errors.js").ResourceDocumentParseError;
    };
