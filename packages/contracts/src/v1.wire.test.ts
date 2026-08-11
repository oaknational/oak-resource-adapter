/**
 * Freezes the v1 wire contract, which a deployed OWA release keeps calling long
 * after this package moves on.
 *
 * If this fails, updating the snapshot is almost never the fix: additive
 * optional fields are safe, anything else needs a v2. See
 * docs/DEVELOPMENT.md#changing-the-api-contract.
 */
import * as z from "zod/mini";
import { describe, expect, it } from "vitest";

import {
  lessonContextSchema,
  resourceAdapterApiContractVersionHeader,
  resourceAdapterApiContractVersionV1,
  resourceAdapterCapabilitiesResponseSchema,
} from "./v1.js";

describe("the v1 wire contract", () => {
  // Not tautological: bumping this in place is the single change that breaks
  // every deployed host at once, and it reads like a routine version bump.
  it("is version 1, and stays version 1", () => {
    expect(resourceAdapterApiContractVersionV1).toBe(1);
  });

  it("is negotiated with an unchanging header name", () => {
    expect(resourceAdapterApiContractVersionHeader).toBe(
      "x-resource-adapter-contract-version",
    );
  });

  it("sends and receives an unchanging shape", async () => {
    const wireContract = {
      version: resourceAdapterApiContractVersionV1,
      versionHeader: resourceAdapterApiContractVersionHeader,
      request: z.toJSONSchema(lessonContextSchema),
      response: z.toJSONSchema(resourceAdapterCapabilitiesResponseSchema),
    };

    await expect(JSON.stringify(wireContract, null, 2)).toMatchFileSnapshot(
      "./__snapshots__/v1-wire-contract.json",
    );
  });
});
