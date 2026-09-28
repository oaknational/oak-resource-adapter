# Vercel projects

Two calls to the shared
[`vercel_project`](https://github.com/oaknational/oak-terraform-modules) module,
producing `oak-resource-adapter-api` from `apps/api` and
`oak-resource-adapter-harness` from `apps/harness`.
[Deployment](../../docs/DEPLOYMENT.md) describes how deployments reach them.

## Environment variables

Every Vercel environment variable on the Preview, `staging` and production
deployments is owned here, from workspace variables in
`oak-resource-adapter-project-api`. `locals.tf` decides each value's
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

There is no `development` target: Vercel rejects a key present in both
`development` and a custom environment. Local development gets its values from
Doppler instead; see [where configuration
lives](../../docs/DEVELOPMENT.md#where-configuration-lives).

## Applying

The workspace is `oak-resource-adapter-project-api` in Terraform Cloud, selected
by the tags in `terraform.tf`. Plans and applies run there; no GitHub workflow
runs Terraform. The project IDs and bypass secrets the deploy workflows need are
copied from the workspace outputs into GitHub repository secrets.
