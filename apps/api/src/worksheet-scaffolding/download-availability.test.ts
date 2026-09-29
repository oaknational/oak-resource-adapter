import { beforeAll, expect, it } from "vitest";
import { downloadAvailability } from "./download-availability";
import { head, loadWorksheet } from "./test-doubles";

beforeAll(loadWorksheet);

it("explains an original worksheet even while suggestion generation is busy", () => {
  const snapshot = head();
  expect(
    downloadAvailability({
      ...snapshot,
      busy: true,
      storedDocument: { ...snapshot.storedDocument, origin: "oak_resource" },
    }),
  ).toBe("original");
});
it("does not offer abandoned or unrelated adaptations for download", () => {
  const snapshot = head();
  expect(
    downloadAvailability({
      ...snapshot,
      adaptation: { ...snapshot.adaptation, abandonedAt: new Date() },
    }),
  ).toBe("unavailable");
  expect(
    downloadAvailability({
      ...snapshot,
      adaptation: { ...snapshot.adaptation, capabilityId: "another-capability" },
    }),
  ).toBe("unavailable");
});
