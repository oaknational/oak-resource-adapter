# Analytics

The UI reports teacher activity through the `onAnalyticsEvent` prop on
`ResourceAdapterDialog`. Hosts own delivery, identity, consent and deployment
metadata; the event plan itself is Oak's Avo tracking plan.

| Host                               | Sender                        | PostHog project                |
| ---------------------------------- | ----------------------------- | ------------------------------ |
| Harness: local, Preview, `staging` | Direct PostHog adapter        | `oak-resource-adapter-staging` |
| OWA production                     | OWA's generated Avo functions | `Production`                   |
| OWA local and Preview              | OWA's generated Avo functions | `Development`                  |

OWA maps the event union to its Avo functions with an exhaustive switch and
sends through its own PostHog instance and consent flow. Hosts fire "Resource Adapter Opened"
themselves, with the control `ResourceAdapterButton` passes to
`onSelectCapability` as its `Component Type`.

## Events

| Event                            | Fires when                                                                                                                                                |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Resource Adapter Closed          | The teacher dismisses the dialog. Leaving the page does not fire it.                                                                                      |
| Adaptation Started               | The API confirms a new or resumed adaptation (`startMode`).                                                                                               |
| Adaptation Restart Requested     | The teacher asks to replace an adaptation. The ID is the old one; the replacement fires Adaptation Started with the new ID.                               |
| New Suggestions Requested        | The teacher asks for regeneration. Automatic generation has no request event.                                                                             |
| Suggestions Displayed            | A generation's result renders, including "No scaffolds suggested" as a count of zero: once per generation job per dialog visit, so resuming counts again. |
| Transformation Requested         | The teacher chooses a suggestion.                                                                                                                         |
| Transformation Preview Displayed | A generated transformation renders for review: once per attempt per visit. A retry is a new attempt.                                                      |
| Transformation Review Requested  | The teacher chooses accept, undo or retry (`reviewAction`).                                                                                               |
| Transformation Reviewed          | The API confirms accept or undo. A successful retry shows as its new preview.                                                                             |
| Suggestion Dismissal Requested   | The teacher dismisses the suggestions for a target.                                                                                                       |
| Transformation Removal Requested | The teacher removes an accepted scaffold.                                                                                                                 |
| Adaptation Request Failed        | A request fails; `requestAction` names it, `retryTarget` says what a retry was for, and no error text is sent.                                            |
| Adaptation Step Failed           | A failed background job is observed, with its ID and kind but never its failure text.                                                                     |
| Adapted Resource Downloaded      | The file is handed to the browser's download mechanism, which does not prove it was saved.                                                                |

Request events measure intent: removal and dismissal claim no outcome when
their enqueue requests return.

Outcomes are what one mounted workflow observes, not a job ledger. Work that
finishes after the teacher leaves may never be reported, and two tabs can
report the same job, so count unique outcomes by job ID. Resuming skips a job
that had already failed. "Displayed" means rendered, not scrolled into view.

## Harness

The [adapter](../apps/harness/app/_analytics/analytics.ts) sends each event
under the title-case property names Avo uses, and tags every event with
`Environment`, `Release` and `Automated Run`. PostHog would drop Playwright's
events as bots, so the adapter turns that filter off instead: filter on
`Automated Run = false` for human usage.

`NEXT_PUBLIC_POSTHOG_API_KEY` is inlined at build time, and an empty key sends
nothing. Locally, use the same value as `POSTHOG_API_KEY`; Preview and
`staging` get it from [`locals.tf`](../infrastructure/project/locals.tf). Only a
project key (`phc_`) belongs in a `NEXT_PUBLIC_` variable, never a personal key
(`phx_`), which can read project data. Ad blockers stop delivery to
`eu.i.posthog.com`, so allow it when testing locally.

## Changing an event

Change the Avo branch first, then the [union](../packages/ui/src/analytics.ts),
the harness adapter and the tests. OWA's exhaustive mapping then fails its type
check until it maps the new event.

Events carry no personal data. Document content, model-written text and anything
a teacher typed can contain it, and there is no reliable way to check, so none of
them is sent. Send stable identifiers rather than display text: the
transformation's `kind` and the chosen option's value, not their labels.
[`analytics.test.ts`](../packages/ui/src/analytics.test.ts) lists every
property an event may carry and fails the type check when one is added.
