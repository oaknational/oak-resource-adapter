# Teacher access

## Tiers

A teacher has `full` access when their Clerk user's `privateMetadata.region` is
`GB`, `IM`, `JE` or `GG`, when `privateMetadata.ora.access` is exactly `"full"`,
or when they have a verified `@thenational.academy` address. Every other teacher,
including one with no stored region, is `limited`. ORA ignores unverified
addresses.

OWA and Aila onboarding store the region. ORA only reads it.

A limited teacher can start adapting `USAGE_LIMIT_ADAPTED_RESOURCES_PER_MONTH`
distinct resources each calendar month, UK time, or 3 when unset. A resource
counts once a month however often the teacher opens it. Starting again on work
from an earlier month counts in the new month.
Resuming and downloading existing work remain available after the allowance is used.

The daily model job limit ([background jobs](BACKGROUND_JOBS.md#usage-limits))
applies to both tiers. A teacher with a verified Oak address gets 1000
(`OAK_MODEL_JOBS_PER_24H`) instead. `privateMetadata.ora.usageLimits.modelJobsPer24h`
replaces either for one teacher. ORA does not read Aila's
`privateMetadata.customRateLimit`, which counts Aila generations.

ORA caches each teacher's access and refreshes it before refusing work because
of a usage limit, so a grant or raised limit applies on their next attempt.

## Copyright region

A lesson Oak marks `agf__geo_restricted` is offered only to a teacher whose
stored region is in `COPYRIGHT_REGIONS`, OWA's list for geo-restricted downloads.
This is independent of the tier: neither an `ora.access` grant nor an Oak
address unlocks it.

## Test accounts

A marker in a verified Oak address lets an Oak account test a limit:

- `access-limit-me`: the account behaves like a teacher outside the UK, whatever
  its stored region. It is `limited`, is never offered geo-restricted lessons,
  and has the default daily limit.
- `rate-limit-me`: the daily limit is 5 (`RATE_LIMIT_ME_MODEL_JOBS_PER_24H`).

Both markers can be used on one account, in one address or in separate ones. An
`ora.access` grant takes precedence over `access-limit-me` for access, and
`ora.usageLimits.modelJobsPer24h` over either marker's daily limit.

## Changing a teacher's access

`pnpm access:grant <clerkUserId>` grants full access or sets a daily limit; run it
without arguments for its options.

The script reads `CLERK_SECRET_KEY` from the repository's `.env`, normally the
development key, and prints which Clerk instance it wrote to. A key set in the
shell takes precedence, so a production change can set the production key for
that one command.

Accounts without a stored region, including harness and browser-test
accounts, are never offered geo-restricted lessons. They are limited unless they
are granted or have a verified Oak address. The harness
access indicator shows the account, Clerk instance and grant command.
