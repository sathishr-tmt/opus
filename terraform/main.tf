# Service account for Cloud Run to pull images from Artifact Registry
resource "google_service_account" "cloud_run_sa" {
  account_id   = "opus-cloud-run"
  display_name = "OPUS Cloud Run Service Account"
  description  = "Service account for OPUS Cloud Run with AR permissions"
}

# Grant Cloud Run service account permission to pull from Artifact Registry
resource "google_project_iam_member" "artifactregistry_reader" {
  project = var.gcp_project_id
  role    = "roles/artifactregistry.reader"
  member  = "serviceAccount:${google_service_account.cloud_run_sa.email}"
}

# Cloud Run service
resource "google_cloud_run_service" "opus" {
  name     = var.service_name
  location = var.gcp_region

  template {
    spec {
      service_account_name = google_service_account.cloud_run_sa.email

      containers {
        image = var.image_uri

        ports {
          container_port = var.port
        }

        resources {
          limits = {
            memory = var.memory
            cpu    = var.cpu
          }
        }

        # Environment variables passed to the container
        env {
          name  = "NODE_ENV"
          value = "production"
        }

        env {
          name  = "PORT"
          value = tostring(var.port)
        }

        env {
          name  = "MONGODB_URI"
          value = var.mongodb_uri
        }

        env {
          name  = "JWT_SECRET"
          value = var.jwt_secret
        }

        env {
          name  = "APPROVAL_TOKEN_SECRET"
          value = var.approval_token_secret
        }

        env {
          name  = "FRONTEND_URL"
          value = var.frontend_url != "" ? var.frontend_url : "https://${google_cloud_run_service.opus.status[0].url}"
        }

        env {
          name  = "BACKEND_URL"
          value = "https://${google_cloud_run_service.opus.status[0].url}"
        }

        env {
          name  = "COOKIE_SECURE"
          value = "true"
        }

        env {
          name  = "COOKIE_SAME_SITE"
          value = "lax"
        }

        # Optional: SMTP config (leave empty if not using email)
        dynamic "env" {
          for_each = var.smtp_user != "" ? [1] : []
          content {
            name  = "SMTP_USER"
            value = var.smtp_user
          }
        }

        dynamic "env" {
          for_each = var.smtp_pass != "" ? [1] : []
          content {
            name  = "SMTP_PASS"
            value = var.smtp_pass
          }
        }
      }

      timeout_seconds = 300
    }

    metadata {
      annotations = {
        "autoscaling.knative.dev/minScale" = tostring(var.min_instances)
        "autoscaling.knative.dev/maxScale" = tostring(var.max_instances)
      }
    }
  }

  traffic {
    percent         = 100
    latest_revision = true
  }

  depends_on = [google_project_iam_member.artifactregistry_reader]
}

# Make Cloud Run service publicly accessible (remove if you want restricted access)
resource "google_cloud_run_service_iam_member" "public_access" {
  service  = google_cloud_run_service.opus.name
  location = google_cloud_run_service.opus.location
  role     = "roles/run.invoker"
  member   = "allUsers"
}
