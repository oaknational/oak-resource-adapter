# The deploy workflows need the project IDs to target a deployment and both
# bypass secrets to reach protected ones. Reading them from the workspace keeps
# them out of the Vercel dashboard and out of anyone's clipboard.
#
# These depend on the module gaining an outputs.tf; see README.md.

output "api_project_id" {
  description = "Vercel project ID for the API, for VERCEL_PROJECT_ID_API"
  value       = module.api.project_id
}

output "harness_project_id" {
  description = "Vercel project ID for the harness, for VERCEL_PROJECT_ID_HARNESS"
  value       = module.harness.project_id
}

# The harness proxy sends the API's secret; the browser tests send the harness's
# own. Two different values, and swapping them fails in a way that looks like a
# broken deployment rather than a misconfiguration.
output "api_protection_bypass_secret" {
  description = "API bypass secret, for the harness's RESOURCE_ADAPTER_API_BYPASS_SECRET"
  value       = module.api.protection_bypass_for_automation_secret
  sensitive   = true
}

output "harness_protection_bypass_secret" {
  description = "Harness bypass secret, for the browser tests' VERCEL_AUTOMATION_BYPASS_SECRET"
  value       = module.harness.protection_bypass_for_automation_secret
  sensitive   = true
}
