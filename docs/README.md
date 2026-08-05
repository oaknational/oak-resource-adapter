# Documentation

Contributor documentation for the Oak Resource Adapter. The public-facing
overview lives in the [repository README](../README.md); the documents here
cover how the repository is developed and operated.

How the repository is developed and released:

- [Development notes](DEVELOPMENT.md): repository-operational knowledge,
  including secret management with Doppler, migrations and contributor-facing
  Changesets guidance.
- [Release process](RELEASE_PROCESS.md): how to release the API and packages and
  update OWA, plus the temporary first-release checklist.
- [UI local development workflow](UI_LOCAL_DEVELOPMENT.md): how to test
  local, unpublished package changes inside a host app such as OWA using
  yalc.

How the service works:

- [Database](DATABASE.md): the schema, the migration workflow, and the data
  protection implications of what it stores.
- [Background jobs](BACKGROUND_JOBS.md): how the API and worker divide
  responsibility, and where durable output belongs.
- [Model invocation](MODEL_INVOCATION.md): how generation code reaches an AI
  model without naming one, through roles, transports and recorders.
