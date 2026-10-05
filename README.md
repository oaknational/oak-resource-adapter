# Oak Resource Adapter

Oak Resource Adapter (ORA) lets teachers adapt Oak lesson resources for their
pupils, from the lesson page on Oak's website.

It's currently an MVP with a single capability, worksheet scaffolding. ORA
reviews a lesson's worksheet and suggests scaffolds where pupils may need
support, such as a word bank, sentence starters or a task broken into ordered
steps. A teacher applies the ones they want, reviews each change before keeping
it, and downloads the result as an editable Word document. Unfinished work is
saved and offered back when they return.

## How it fits together

Oak's website (OWA) installs the published `@oaknational/resource-adapter` React
package and renders its button and dialog on lesson pages. The dialog talks to
the ORA API over tRPC. The API reads the lesson from Oak's curriculum, stores
each adaptation in PostgreSQL, and runs model calls as background jobs on
Vercel Workflow.

| Path                                                                           | What it is                                                               |
| ------------------------------------------------------------------------------ | ------------------------------------------------------------------------ |
| [`apps/api`](apps/api)                                                         | The API and background worker, a Next.js app on Vercel                   |
| [`apps/harness`](apps/harness)                                                 | An OWA-like host for running the UI package locally and on Vercel        |
| [`packages/ui`](packages/ui)                                                   | The published React package hosts install                                |
| [`packages/contracts`](packages/contracts)                                     | The tRPC contracts shared by the API and UI, published with the UI       |
| [`packages/resource-document`](packages/resource-document)                     | The schema for worksheets as structured documents, published with the UI |
| [`packages/original-resource-documents`](packages/original-resource-documents) | Retrieves and validates the source worksheet for a lesson                |
| [`packages/curriculum`](packages/curriculum)                                   | Reads lessons and their resource files from Oak                          |
| [`packages/ai`](packages/ai)                                                   | Model invocation, behind roles rather than named models                  |
| [`packages/db`](packages/db)                                                   | The Drizzle schema, migrations and database client                       |
| [`packages/storage`](packages/storage)                                         | Writes generated files to a private Cloud Storage bucket                 |
| [`packages/logger`](packages/logger)                                           | The shared logger                                                        |

## Getting started

You need Node.js 24 (see `.nvmrc`), pnpm 10 or later, a local PostgreSQL, and the
[Doppler CLI](https://docs.doppler.com/docs/install-cli) signed in with access to
the `oak-resource-adapter` project.

Shared development values live in Doppler's `dev` config. Write them into a
local, gitignored `.env` after cloning, and again whenever they change:

```sh
doppler secrets download --project oak-resource-adapter --config dev --no-file --format env > .env
```

Then install, build the local schema and start the apps:

```sh
pnpm install
pnpm db:reset
pnpm dev
```

`pnpm dev` starts the harness on port 3000 and the API on port 3001, with
background jobs running on Workflow's local runtime. If you don't have
PostgreSQL installed, `pnpm docker:db:bootstrap` runs one in Docker.

Before pushing, run `sh .husky/pre-push`, which runs the quick parts of CI. Run
`pnpm exec playwright install chromium` once before your first `pnpm test:e2e`.

The harness differs from OWA in one way: its browser calls its own
`/adapter-proxy` route, which forwards to the API server-side. That lets a
deployed harness pair with an API deployment whose URL is only known once it
exists. OWA calls the API directly.

## Documentation

- [Contributor documentation](docs/README.md): how the service works, and how the
  repository is developed, deployed and released.
- [UI package](packages/ui/README.md): how a host installs and renders ORA.
- [Contributing](CONTRIBUTING.md), [security](SECURITY.md) and the [Oak branding
  and documentation notice](NOTICE.md).
