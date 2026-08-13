output "cloud_run_url" {
  description = "URL of the deployed OPUS Cloud Run service"
  value       = google_cloud_run_service.opus.status[0].url
}

output "cloud_run_service_name" {
  description = "Name of the Cloud Run service"
  value       = google_cloud_run_service.opus.name
}

output "service_account_email" {
  description = "Email of the Cloud Run service account"
  value       = google_service_account.cloud_run_sa.email
}

output "deployment_info" {
  description = "Summary of the deployment"
  value = {
    service_url = google_cloud_run_service.opus.status[0].url
    region      = var.gcp_region
    memory      = var.memory
    cpu         = var.cpu
    image       = var.image_uri
    min_instances = var.min_instances
    max_instances = var.max_instances
  }
}
