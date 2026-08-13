# Documentation

Contributor documentation for the Oak Resource Adapter. The public-facing
overview lives in the [repository README](../README.md); the documents here
cover how the repository is developed and operated.

How the repository is developed and released:

- [Development notes](DEVELOPMENT.md): repository-operational knowledge,
  including secret management, migrations and contributor-facing Changesets
  guidance.
- [Release process](RELEASE_PROCESS.md): how to release the API and packages and
  update OWA, plus the temporary first-release checklist.
- [Deployment](DEPLOYMENT.md): the two Vercel projects, how a Preview pair is
  wired, and how a release reaches the production domain.
- [UI local development workflow](UI_LOCAL_DEVELOPMENT.md): how to test
  local, unpublished package changes inside a host app such as OWA using
  yalc.
- [Comments and documentation](COMMENTS_AND_DOCUMENTATION.md): what earns a
  comment or a document, and what to delete on sight.

How the service works:

- [API boundaries](API_BOUNDARIES.md): where host-facing, internal, and
  server-only contracts belong, and how the published UI API is defined.
- [Dependency architecture](DEPENDENCY_ARCHITECTURE.md): the allowed workspace
  graph and the checks that enforce package boundaries.
- [Database](DATABASE.md): the schema, the migration workflow, and the data
  protection implications of what it stores.
- [Background jobs](BACKGROUND_JOBS.md): how the API and worker divide
  responsibility, and where durable output belongs.
- [Feature flags](FEATURE_FLAGS.md): how flags are named, owned, defaulted and
  retired, and why they control rollout rather than authorisation.
- [Model invocation](MODEL_INVOCATION.md): how generation code reaches an AI
  model without naming one, through roles, transports and recorders.
