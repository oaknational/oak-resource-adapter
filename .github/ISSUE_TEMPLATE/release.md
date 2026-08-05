---
name: Release
about: Track a Resource Adapter release from staging approval to close
title: "Release: YYYY-MM-DD"
labels: ""
assignees: ""
---

# Release YYYY-MM-DD

Replace `TBC` and delete anything that doesn't apply.

## Candidate

- Coordinator: QA — TBC
- Release branch: `release/YYYY-MM-DD`
- Release pull request: TBC
- Source `main` commit: TBC
- Candidate API Preview: TBC
- Candidate harness Preview: TBC
- Package release and OWA update needed: yes/no
- Scope and known limitations: TBC

## Staging approval

On the release pull request:

- [ ] All checks pass. They cover CI, the staging migrations, the paired
      candidate deployments, the contract versions the live OWA still needs, and
      the deployment-safe browser tests.
- [ ] QA tested the lesson contexts and workflows this release affects.
- [ ] QA merged the release branch into `production`.

Staging evidence and notes: TBC

## Production

Going live is automatic once the release branch is merged.

- Production commit: TBC
- Migration run, if this release has migrations: TBC — paste the Actions run URL here
- Live deployment: TBC
- [ ] The production workflow is green. It applied the migrations, checked the
      deployment against production configuration, and moved the domain.
- [ ] QA checked production through OWA.

Production evidence and notes: TBC

Restore the previous deployment if the release is failing. Never reverse an
applied migration: record the decision and fix the schema forward.

## Packages and OWA

Skip this section for an API-only release.

- Version Packages pull request, in this repository: TBC
- Published version: TBC
- OWA pull request pinning that version: TBC
- [ ] QA checked the version bumps and changelog entries in the Version Packages
      pull request, then merged it.
- [ ] Both packages show the published version on npmjs.com.
- [ ] QA approved the OWA Preview against the production adapter API.

## Close

- Production-to-`main` sync pull request: TBC
- [ ] The sync carries the release fixes, versions and changelogs, and keeps
      unreleased Changesets from `main`.
- [ ] The sync is merged into `main`.
- [ ] QA closed this ticket.
