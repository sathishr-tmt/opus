variable "gcp_project_id" {
  description = "GCP Project ID"
  type        = string
}

variable "gcp_region" {
  description = "GCP region for Cloud Run"
  type        = string
  default     = "us-south1"
}

variable "service_name" {
  description = "Cloud Run service name"
  type        = string
  default     = "opus"
}

variable "image_uri" {
  description = "Full URI of the Docker image in Artifact Registry"
  type        = string
  # Example: us-south1-docker.pkg.dev/project-id/opus-repo/opus-app:latest
}

variable "memory" {
  description = "Memory for Cloud Run service (256Mi, 512Mi, 1Gi, etc.)"
  type        = string
  default     = "512Mi"
}

variable "cpu" {
  description = "CPU for Cloud Run service (1, 2, 4, etc.)"
  type        = string
  default     = "1"
}

variable "min_instances" {
  description = "Minimum number of instances"
  type        = number
  default     = 0
}

variable "max_instances" {
  description = "Maximum number of instances"
  type        = number
  default     = 10
}

variable "port" {
  description = "Container port (OPUS backend runs on 5000)"
  type        = number
  default     = 5000
}

variable "mongodb_uri" {
  description = "MongoDB connection string (e.g., MongoDB Atlas URI)"
  type        = string
  sensitive   = true
}

variable "jwt_secret" {
  description = "JWT secret key"
  type        = string
  sensitive   = true
}

variable "approval_token_secret" {
  description = "Approval token secret"
  type        = string
  sensitive   = true
}

variable "frontend_url" {
  description = "Frontend URL (usually same as Cloud Run URL)"
  type        = string
  default     = ""
  # If empty, Terraform will set it to the Cloud Run service URL
}

variable "smtp_user" {
  description = "SMTP username for email"
  type        = string
  sensitive   = true
  default     = ""
}

variable "smtp_pass" {
  description = "SMTP password for email"
  type        = string
  sensitive   = true
  default     = ""
}

variable "labels" {
  description = "Labels to apply to Cloud Run service"
  type        = map(string)
  default = {
    app         = "opus"
    environment = "production"
    managed_by  = "terraform"
  }
}
