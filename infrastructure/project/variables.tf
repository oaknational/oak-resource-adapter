variable "cloudflare_zone_domain" {
  description = "The Cloudflare zone domain for DNS configuration"
  type        = string
}

variable "api_domain" {
  description = "Production domain for the API, promoted onto by deploy-production.yml"
  type        = string
}

variable "api_staging_domain" {
  description = "Domain for the API's staging custom environment, tracking main"
  type        = string
}

# The module validates every custom environment domain against the zone, so the
# harness needs a real domain here even though it has no production one.
variable "harness_staging_domain" {
  description = "Domain for the harness staging custom environment, tracking main"
  type        = string
}

variable "env_vars" {
  description = <<-EOT
    Non-secret Vercel environment variables, grouped by destination:
      api_shared      the API's production and preview targets
      api_preview     the API's preview target, inherited by staging
      api_staging     overrides applied on top of api_preview
      api_development pulled into a local .env by `pnpm env:pull:dev`
      harness_preview the harness's preview target, inherited by its staging
  EOT
  type = object({
    api_shared      = optional(map(string), {})
    api_production  = optional(map(string), {})
    api_preview     = optional(map(string), {})
    api_staging     = optional(map(string), {})
    api_development = optional(map(string), {})
    harness_preview = optional(map(string), {})
    harness_staging = optional(map(string), {})
  })
  default = {}

  validation {
    condition     = lookup(var.env_vars.api_production, "ENABLE_DEV_ROUTES", "") == ""
    error_message = "ENABLE_DEV_ROUTES must not reach production: the /dev routes are unauthenticated."
  }
}

# The empty defaults are deliberate: locals.tf drops them rather than writing.
variable "clerk_secret_key_production" {
  description = "Clerk secret key for the production Clerk instance"
  type        = string
  sensitive   = true
  default     = ""
}

# The deployed harness and the browser tests verify the same sessions, so a
# second instance fails the suite at sign-in.
variable "clerk_secret_key_test" {
  description = "Clerk secret key shared by preview, staging and local development"
  type        = string
  sensitive   = true
  default     = ""
}

variable "curriculum_api_key_development" {
  description = "Key for Oak's curriculum endpoint, for local development"
  type        = string
  sensitive   = true
  default     = ""
}

variable "curriculum_api_key_staging" {
  description = "Key for Oak's curriculum endpoint, for Preview and staging"
  type        = string
  sensitive   = true
  default     = ""
}

variable "curriculum_api_key_production" {
  description = "Key for Oak's curriculum endpoint, for production"
  type        = string
  sensitive   = true
  default     = ""
}

# One PostHog project per environment. Vercel builds every deployment with
# NODE_ENV=production, which selects the PostHog adapter whatever USE_POSTHOG
# says, so preview and staging need a key as much as production does.
variable "posthog_api_key_development" {
  description = "PostHog project API key for local development"
  type        = string
  sensitive   = true
  default     = ""
}

variable "posthog_api_key_staging" {
  description = "PostHog project API key for Preview and staging"
  type        = string
  sensitive   = true
  default     = ""
}

variable "posthog_api_key_production" {
  description = "PostHog project API key for production"
  type        = string
  sensitive   = true
  default     = ""
}

# One key per environment, so a leaked local key cannot spend staging's quota and
# any one can be revoked without touching the others.
variable "openai_api_key_development" {
  description = "OpenAI API key for local development"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key_staging" {
  description = "OpenAI API key for Preview and staging"
  type        = string
  sensitive   = true
  default     = ""
}

variable "openai_api_key_production" {
  description = "OpenAI API key for production"
  type        = string
  sensitive   = true
  default     = ""
}

# initSentry throws without this under NODE_ENV=production, and Vercel builds
# every deployment that way, so it belongs in every target rather than
# production alone.
variable "sentry_dsn" {
  description = "Sentry DSN for the API, required in every target"
  type        = string
  sensitive   = true
  default     = ""
}

variable "sentry_auth_token" {
  description = "Uploads source maps at build time; stack traces stay minified without it"
  type        = string
  sensitive   = true
  default     = ""
}

variable "e2e_clerk_user_email" {
  description = "Clerk test user the browser suite signs in as, for local runs"
  type        = string
  sensitive   = true
  default     = ""
}
