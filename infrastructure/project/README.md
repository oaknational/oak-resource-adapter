# Vercel projects

Two calls to the shared
[`vercel_project`](https://github.com/oaknational/oak-terraform-modules) module,
producing `oak-resource-adapter-api` from `apps/api` and
`oak-resource-adapter-harness` from `apps/harness`.
[Deployment](../../docs/DEPLOYMENT.md) describes how deployments reach them.

## Environment variables

The Vercel environment variables on the Preview, `staging` and production
deployments are owned here, from workspace variables in
`oak-resource-adapter-project-api`, apart from the two the deploy workflow sets
on each harness deployment (see
[deployment](../../docs/DEPLOYMENT.md#how-the-preview-pair-is-wired)).
`locals.tf` decides each value's
destination: secrets arrive as the sensitive variables in `variables.tf` and
everything else in `var.env_vars`, grouped by target.

One workspace holds all of them. The environments are Vercel targets on the two
projects, not separate workspaces — a `vercel_project` and its variables are one
resource each, so they cannot be split across workspaces without splitting the
projects.

| Environment | Vercel destination                                     | Fed from                                    | Reached by              |
| ----------- | ------------------------------------------------------ | ------------------------------------------- | ----------------------- |
| staging     | `preview` target, and the `staging` custom environment | `api_preview`, then `api_staging` overrides | every branch; `main`    |
| production  | `production` target                                    | `api_shared` and `api_production`           | the `production` branch |

There is no `development` target; see `locals.tf`.

## Applying

Plans and applies run in the Terraform Cloud workspace; no GitHub workflow runs
Terraform.
