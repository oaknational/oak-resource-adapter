type Link = Readonly<{ label: string; href: string }>;

export const termsCopy = {
  /**
   * Raise it with the wording. ORA records it when the teacher accepts, only up
   * to the API's `LATEST_ORA_TERMS_VERSION`, so raise that first.
   */
  version: 1,
  heading: "Before you adapt with AI",
  paragraphs: [
    [
      "The ",
      {
        label: "terms and conditions",
        href: "https://www.thenational.academy/legal/terms-and-conditions",
      },
      " and ",
      {
        label: "privacy policy",
        href: "https://www.thenational.academy/legal/privacy-policy",
      },
      " for your Oak account also apply when you adapt resources with AI.",
    ],
    ["AI can make mistakes. Review content before use."],
  ] satisfies ReadonlyArray<ReadonlyArray<string | Link>>,
  accept: "Accept and continue",
  back: "Back to lesson",
  acceptFailed: "We couldn't save that. Try again.",
  outdated: "These terms have changed. Reload the page to see the latest version.",
} as const;
