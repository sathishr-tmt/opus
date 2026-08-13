terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }

  # Uncomment to use Cloud Storage for state (recommended for teams)
  # backend "gcs" {
  #   bucket = "your-terraform-state-bucket"
  #   prefix = "opus"
  # }
}

provider "google" {
  project = var.gcp_project_id
  region  = var.gcp_region
}
