import { describe, expect, it } from "vitest";

import { tidyKeywordDefinition } from "./definition-list";

describe("tidyKeywordDefinition", () => {
  it.each([
    [
      "air resistance",
      "Air resistance is a type of frictional force that acts between the air and the surface of a moving object.",
      "a type of frictional force that acts between the air and the surface of a moving object.",
    ],
    ["Dividend", "The dividend is what we are dividing.", "what we are dividing."],
    ["BCE", "BCE is short for 'Before Common Era'", "short for 'Before Common Era'"],
    ["account", "an account is a version of events", "a version of events"],
    [
      "ion",
      "An atom or molecule that has lost or gained one or more electrons so has a charge.",
      "an atom or molecule that has lost or gained one or more electrons so has a charge.",
    ],
    [
      "dot–and–cross diagram",
      "Used to show how chemical bonds are formed between atoms",
      "Used to show how chemical bonds are formed between atoms",
    ],
    [
      "Mount Olympus",
      "Mount Olympus is the highest mountain in Greece",
      "the highest mountain in Greece",
    ],
  ])("tidies Oak's definition of %s", (keyword, description, expected) => {
    expect(tidyKeywordDefinition(keyword, description)).toBe(expected);
  });
});
