# Vercel projects

Two calls to the shared
[`vercel_project`](https://github.com/oaknational/oak-terraform-modules) module,
producing `oak-resource-adapter-api` from `apps/api` and
`oak-resource-adapter-harness` from `apps/harness`.
[Deployment](../../docs/DEPLOYMENT.md) describes how deployments reach them.

## Not ready to apply

Written ahead of the infrastructure it needs, so that it can be reviewed and
corrected rather than described. Before a first apply it needs a Terraform Cloud
workspace, the three domains under `var.cloudflare_zone_domain`, and two
additions to the module:

- **`auto_assign_custom_domains` as an input**, so a production deployment can
  exist without taking the domain until the workflow has checked it. The pinned
  provider supports the attribute; the module does not pass it through.
- **`project_id` and `protection_bypass_for_automation_secret` on `outputs.tf`**,
  which the deploy workflows read. It currently exposes only a Sentry message.

`terraform validate` fails on exactly those two and nothing else, which is the
intended state until they land.
