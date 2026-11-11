type Link = Readonly<{ label: string; href: string }>;

/** Placeholder until product agrees the wording. */
export const termsCopy = {
  /**
   * Raise it with the wording. ORA records it when the teacher accepts, only up
   * to the API's `LATEST_ORA_TERMS_VERSION`, so raise that first.
   */
  version: 1,
  heading: "Before you adapt with AI",
  paragraphs: [
    [
      "By using your Oak account, you've agreed to our ",
      {
        label: "terms and conditions",
        href: "https://www.thenational.academy/legal/terms-and-conditions",
      },
      " and ",
      {
        label: "privacy policy",
        href: "https://www.thenational.academy/legal/privacy-policy",
      },
      ". They apply when you adapt resources with AI too.",
    ],
    [
      "AI can get things wrong. Check each adapted resource before you use it with your pupils.",
    ],
  ] satisfies ReadonlyArray<ReadonlyArray<string | Link>>,
  accept: "Accept and continue",
  back: "Back to lesson",
  acceptFailed: "We couldn't save that. Try again.",
  outdated: "These terms have changed. Reload the page to see the latest version.",
} as const;
