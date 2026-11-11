# Teacher access

## Account setup

ORA offers nothing to a signed-in teacher until OWA onboarding has set
`publicMetadata.owa.isOnboarded`. Until then the capabilities response reports
the account as `needsSetup`, and opening worksheet scaffolding from a lesson
returns `needsSetup` instead of starting work. Aila's onboarding does not count:
OWA onboarding keeps the region Aila stored and leaves Aila's metadata alone.

The harness cannot reach OWA onboarding, so its sign-in and "Finish setup" go
through a stand-in at `/onboarding`, also linked as "Account setup" in the
header. It writes `owa.isOnboarded` and the region the tester picks, or clears
both, on the development Clerk instance only.

A teacher who onboarded before OWA stored a region, or whose region header was
missing, has no region. They are ready, outside the copyright regions, and
limited unless one of the other tier rules gives them full access. Onboarding
again does not add a region, because OWA sends onboarded teachers straight back.

## Tiers

A teacher has `full` access when their Clerk user's `privateMetadata.region` is
`GB`, `IM`, `JE` or `GG`, when `privateMetadata.ora.access` is exactly `"full"`,
when they have a verified `@thenational.academy` address, or when Aila gives
them full access (`publicMetadata.labs.isDemoUser` is exactly `false`). Every
other teacher, including one with no stored region, is `limited`. ORA ignores
unverified addresses.

ORA reads Aila's flag only until Aila is sunset, when ADAPT-203 copies Aila's
exceptions into ORA grants. Aila sets the flag for teachers in the same regions
as ORA, for exceptions staff set by hand, and for every pre-release beta user.
ORA never writes `publicMetadata.labs`.

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

ORA caches each onboarded teacher's access, for 10 minutes in production and 10
seconds elsewhere, and refreshes it before refusing work because of a usage
limit, so a grant or raised limit applies on their next attempt. A teacher who
needs setup is looked up on every request, so the first request after
onboarding sees it.

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
`access-limit-me` takes precedence over Aila's flag, which Aila sets on every UK
account that has used it.

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
