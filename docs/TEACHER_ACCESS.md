# Teacher access

## Tiers

A teacher has `full` access when their Clerk user's `privateMetadata.region` is
`GB`, `IM`, `JE` or `GG`, or when `privateMetadata.ora.access` is exactly
`"full"`. Every other teacher, including one with no stored region, is `limited`.

OWA and Aila onboarding store the region. ORA only reads it.

A limited teacher can start adapting `USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH`
distinct resources each calendar month, UK time, or 3 when unset. A resource
counts once a month however often the teacher opens it. Starting again on work
from an earlier month counts in the new month.
Resuming and downloading existing work remain available after the allowance is used.

The daily model job limit ([background jobs](BACKGROUND_JOBS.md#usage-limits))
applies to both tiers. `privateMetadata.ora.usageLimits.modelJobsPer24h`
replaces it for one teacher. ORA does not read Aila's
`privateMetadata.customRateLimit`, which counts Aila generations.

ORA caches each teacher's access and refreshes it before refusing work because
of a usage limit, so a grant or raised limit applies on their next attempt.

## Copyright region

A lesson Oak marks `agf__geo_restricted` is offered only to a teacher whose
stored region is in `COPYRIGHT_REGIONS`, OWA's list for geo-restricted downloads.
This is independent of the tier: an `ora.access` grant does not unlock it.

## Changing a teacher's access

`pnpm access:grant <clerkUserId>` grants full access or sets a daily limit; run it
without arguments for its options.

The script reads `CLERK_SECRET_KEY` from the repository's `.env`, normally the
development key, and prints which Clerk instance it wrote to. A key set in the
shell takes precedence, so a production change can set the production key for
that one command.

Accounts without a stored region, including harness and browser-test accounts,
are limited until granted, and are never offered geo-restricted lessons. The harness
access indicator shows the account, Clerk instance and grant command.
