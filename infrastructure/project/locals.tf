# Every Vercel environment variable for both projects.
#
# Secrets arrive as the sensitive variables in variables.tf and are tagged here
# so the flag survives the merges below. Everything else arrives in var.env_vars.
# An empty value is dropped rather than written, so a value that does not exist
# yet needs no placeholder — which matters most for the Cloud SQL set, where
# readCloudSqlConfig() throws on a half-filled one.

locals {
  secret_values = {
    # SENTRY_DSN is one project across every environment; SENTRY_ENVIRONMENT is
    # what separates the events.
    api_shared = {
      POSTHOG_API_KEY   = var.posthog_api_key
      SENTRY_AUTH_TOKEN = var.sentry_auth_token
      SENTRY_DSN        = var.sentry_dsn
    }

    api_production = {
      CLERK_SECRET_KEY                                   = var.clerk_secret_key_production
      CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY = var.curriculum_api_key_production
      OPENAI_API_KEY                                     = var.openai_api_key_production
    }

    api_preview = {
      CLERK_SECRET_KEY                                   = var.clerk_secret_key_test
      CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY = var.curriculum_api_key_staging
      OPENAI_API_KEY                                     = var.openai_api_key_staging
    }

    api_staging     = {}
    harness_preview = { CLERK_SECRET_KEY = var.clerk_secret_key_test }
    harness_staging = {}

    # E2E_CLERK_USER_EMAIL is read by `pnpm test:e2e` locally, not by any
    # deployment.
    api_development = {
      CLERK_SECRET_KEY                                   = var.clerk_secret_key_test
      CURRICULUM_DB_HASURA_AUTH_RESOURCE_ADAPTER_API_KEY = var.curriculum_api_key_development
      E2E_CLERK_USER_EMAIL                               = var.e2e_clerk_user_email
      OPENAI_API_KEY                                     = var.openai_api_key_development
    }
  }

  groups = {
    for group, values in var.env_vars : group => merge(
      { for key, value in values : key => { value = value, sensitive = false } },
      {
        for key, value in lookup(local.secret_values, group, {}) :
        key => { value = value, sensitive = true }
      }
    )
  }

  # Staging inherits preview and overrides only what differs between them.
  api_targets = {
    development = local.groups.api_development
    preview     = merge(local.groups.api_shared, local.groups.api_preview)
    production  = merge(local.groups.api_shared, local.groups.api_production)
  }
  api_staging = merge(
    local.groups.api_shared,
    local.groups.api_preview,
    local.groups.api_staging
  )

  # No production target: the harness is never deployed there. No development one
  # either, because one root .env feeds both apps and the API project carries it.
  harness_targets = {
    preview = local.groups.harness_preview
  }
  harness_staging = merge(local.groups.harness_preview, local.groups.harness_staging)

  api_environment_variables = flatten([
    for target, values in local.api_targets : [
      for key, entry in values : {
        key       = key
        value     = entry.value
        target    = [target]
        sensitive = entry.sensitive
      } if entry.value != ""
    ]
  ])

  harness_environment_variables = flatten([
    for target, values in local.harness_targets : [
      for key, entry in values : {
        key       = key
        value     = entry.value
        target    = [target]
        sensitive = entry.sensitive
      } if entry.value != ""
    ]
  ])

  api_staging_env_vars = [
    for key, entry in local.api_staging : {
      key                     = key
      value                   = entry.value
      custom_environment_name = "staging"
      sensitive               = entry.sensitive
    } if entry.value != ""
  ]

  harness_staging_env_vars = [
    for key, entry in local.harness_staging : {
      key                     = key
      value                   = entry.value
      custom_environment_name = "staging"
      sensitive               = entry.sensitive
    } if entry.value != ""
  ]
}
