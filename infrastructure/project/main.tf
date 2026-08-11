locals {
  repo_name        = "oak-resource-adapter"
  workspace_prefix = "${local.repo_name}-project-"
}

resource "terraform_data" "workspace_validation" {
  lifecycle {
    precondition {
      condition     = startswith(terraform.workspace, local.workspace_prefix)
      error_message = "Workspace name \"${terraform.workspace}\" must begin with ${local.workspace_prefix}"
    }
  }
}

# Serves OWA and the harness. The only project with database and Clerk
# secret-key access.
#
# The module derives the project name as `<repo>-<build_type>`, giving
# oak-resource-adapter-api and oak-resource-adapter-harness. v2.2.0 is current
# and does not yet carry the two additions used below; see README.md. Terraform
# requires a literal source, so the ref is repeated on the second call.
module "api" {
  source                 = "github.com/oaknational/oak-terraform-modules//modules/vercel_project?ref=v2.2.0"
  build_type             = "api"
  cloudflare_zone_domain = var.cloudflare_zone_domain
  framework              = "nextjs"
  git_repo               = "oaknational/${local.repo_name}"
  project_visibility     = "public"
  root_directory         = "apps/api"

  # QA merges into `production`; `main` reaches the staging custom environment
  # below.
  production_branch = "production"
  domains           = [var.api_domain]

  custom_environments = [
    {
      name        = "staging"
      domain      = var.api_staging_domain
      branch_name = "main"
    }
  ]

  # What makes the staged production in docs/RELEASE_PROCESS.md possible: the
  # deployment exists without the domain, deploy-production.yml checks it, and
  # only then promotes. See README.md — this input does not exist yet.
  auto_assign_custom_domains = false

  # deploy-preview.yml reaches protected deployments with the bypass secret.
  protection_bypass_for_automation = true

  environment_variables = local.api_environment_variables
  custom_env_vars       = local.api_staging_env_vars
}

# Development and QA only. Never deployed to production, and holds no database
# or Clerk secret-key access.
module "harness" {
  source                 = "github.com/oaknational/oak-terraform-modules//modules/vercel_project?ref=v2.2.0"
  build_type             = "harness"
  cloudflare_zone_domain = var.cloudflare_zone_domain
  framework              = "nextjs"
  git_repo               = "oaknational/${local.repo_name}"
  project_visibility     = "public"
  root_directory         = "apps/harness"

  # No production domain, but `main` must still not be the production branch, or
  # every merge would build one.
  production_branch = "production"

  custom_environments = [
    {
      name        = "staging"
      domain      = var.harness_staging_domain
      branch_name = "main"
    }
  ]

  protection_bypass_for_automation = true

  environment_variables = local.harness_environment_variables
  custom_env_vars       = local.harness_staging_env_vars
}
