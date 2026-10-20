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
      "gland",
      "An organ or tissues that produces hormones.",
      "an organ or tissues that produces hormones.",
    ],
    [
      "choisir",
      "French -ir verb meaning 'to choose'",
      "French -ir verb meaning 'to choose'",
    ],
    ["[s]", "pronounced as in 'maison'", "pronounced as in 'maison'"],
  ])("tidies Oak's definition of %s", (keyword, description, expected) => {
    expect(tidyKeywordDefinition(keyword, description)).toBe(expected);
  });
});
