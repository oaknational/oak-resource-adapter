# Repository instructions

Follow the repository conventions in [docs](docs/README.md), including
[comments and documentation](docs/COMMENTS_AND_DOCUMENTATION.md).

## Validation

After making changes, run the complete pre-push checks before handing the work
back: `sh .husky/pre-push </dev/null`, followed by `pnpm exec tsc --noEmit` for
the root scripts and browser tests not covered by the hook's package checks.
Type-checking is required; targeted tests alone are not sufficient.
Run relevant browser or database integration checks
in addition when the change needs them. Report any checks that fail or cannot run.
