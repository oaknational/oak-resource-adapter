# Vercel projects

Two calls to the shared
[`vercel_project`](https://github.com/oaknational/oak-terraform-modules) module,
producing `oak-resource-adapter-api` from `apps/api` and
`oak-resource-adapter-harness` from `apps/harness`.
[Deployment](../../docs/DEPLOYMENT.md) describes how deployments reach them.

## Environment variables

Every Vercel environment variable for both projects is owned here, from workspace
variables in `oak-resource-adapter-project-api`. `locals.tf` decides each value's
destination: secrets arrive as the sensitive variables in `variables.tf` and
everything else in `var.env_vars`, grouped by target.

One workspace holds all of them. The environments are Vercel targets on the two
projects, not separate workspaces — a `vercel_project` and its variables are one
resource each, so they cannot be split across workspaces without splitting the
projects.

| Environment | Vercel destination                                     | Fed from                                    | Reached by              |
| ----------- | ------------------------------------------------------ | ------------------------------------------- | ----------------------- |
| development | `development` target, never deployed                   | `api_development`                           | `pnpm env:pull:dev`     |
| staging     | `preview` target, and the `staging` custom environment | `api_preview`, then `api_staging` overrides | every branch; `main`    |
| production  | `production` target                                    | `api_shared` and `api_production`           | the `production` branch |

## Not ready to apply

Written ahead of the infrastructure it needs, so that it can be reviewed and
corrected rather than described. Before a first apply it needs a Terraform Cloud
workspace and the three domains under `var.cloudflare_zone_domain`.

The two module additions this configuration was written against —
`auto_assign_custom_domains` as an input, and `project_id` and
`protection_bypass_for_automation_secret` on `outputs.tf` — landed in v2.3.0,
which `main.tf` now pins by commit.
