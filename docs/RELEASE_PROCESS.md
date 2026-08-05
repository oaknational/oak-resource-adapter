# Resource Adapter release process

QA coordinates every release, from cutting a candidate to syncing `production`
back into `main`. A release takes a known-good `main` commit through staging,
into `production`, onto the production domain and — when packages change — out
to npm and the Oak Web Application (OWA).

Keep one candidate active at a time. Development can continue on `main`
throughout. Parts of this process describe deployment automation that is still
being built.

## Branches

| Branch               | Purpose                                                                                  |
| -------------------- | ---------------------------------------------------------------------------------------- |
| Feature branches     | Temporary Preview deployments. Currently share the staging database.                     |
| `main`               | Integration branch. Its durable Preview is staging and shares the same staging database. |
| `release/YYYY-MM-DD` | Release candidate cut from a known-good `main` commit and tested by QA.                  |
| `production`         | Reviewed production deployments and package releases.                                    |

Hotfixes branch from `production`, open back into `production`, take the same
checks, then sync into `main`.

## Releasing

In short, a `release/YYYY-MM-DD` branch is cut from `main` and tested in its
Preview. If it holds up, QA merges it into `production`. Everything from there is
automatic: the migrations run, the deployment is built and checked against
production configuration, and it goes live only if those checks pass.

If the release also changes a published package, a second pull request appears
in this repository to publish the new npm version. Merging it publishes to npm,
and a further pull request in OWA pins that version.

An API-only release therefore has a single human gate, the release merge. A
package release adds two more: the version pull request and the OWA update. The
sync back into `main` in step 6 is another merge, but it carries no decision, so
it isn't a gate.

### Why each gate exists

Each one guards something on the other side that is hard to undo.

- **The release merge** is the last point before production changes at all.
  Merging authorises the migrations, and an applied migration can't be reversed.
- **The version pull request** holds publishing back until the API the package
  depends on is live and healthy, because an npm version can never be replaced.
- **The OWA update** is required for OWA to use the new code.

### 1. Prepare the candidate

Open a ticket from the
[release template](../.github/ISSUE_TEMPLATE/release.md) and record the scope
and whether packages and OWA need updating. Confirm `main` is green and its
changes work in staging; every package change needs a Changeset. Cut
`release/YYYY-MM-DD` from the chosen commit and open a pull request into
`production`.

### 2. Test and approve

QA tests the affected flows through the candidate harness, which points at the
candidate API. A contract change must leave the OWA release currently in
production working. Push fixes to the release branch and repeat until QA is
satisfied, recording the evidence and any limitations in the ticket. Nothing
touches production while the pull request is open.

### 3. Merge, deploy and go live

QA merges into `production`. Direct pushes aren't allowed, so the merge is what
authorises production changes.

The production workflow then applies that commit's migrations, builds a
deployment that holds no traffic, and checks it against production configuration
with `/health` and the deployment-safe tests. Only if those pass does it move the
production domain. A failure at any point leaves the live deployment untouched.

QA confirms production through OWA once it is live. A failing release is rolled
back by restoring the previous deployment, and a failing candidate is fixed
forward by pushing the fix to `production`. Never undo an applied migration.

### 4. Publish the packages

Once CI passes on `production`, `release.yml` opens a version pull request. QA
merges it after the API is healthy, and CI then publishes both packages to npm
through OIDC and tags them. Publish a corrected version if something is wrong;
never overwrite or unpublish one.

### 5. Update OWA

QA requests a pull request pinning the published version and engineering opens
it. QA approves its Preview against the production API, and OWA then follows its
own release process.

### 6. Sync and close

QA opens a pull request from `production` into `main` carrying the release
fixes, versions and changelogs, while preserving Changesets `main` hasn't
released yet. Merge it once CI passes, link the evidence and close the ticket.
