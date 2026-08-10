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
