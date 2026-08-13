# OPUS Terraform Deployment (Cloud Run)

This Terraform configuration deploys OPUS to Google Cloud Run with automatic image updates from Artifact Registry.

## Architecture Overview

```
GitHub Commit
    ↓
GitHub Actions Workflow
    ↓
Build & Push Docker Image to Artifact Registry
    ↓
Terraform (Cloud Run)
    ↓
Pull Latest Image & Deploy
```

## What Each File Does

### `provider.tf`
- Configures the Google Cloud provider
- Sets up Terraform backend (can use Cloud Storage for state)
- Specifies required provider versions

### `variables.tf`
- Defines all input variables (like function parameters)
- Includes descriptions, types, defaults, and sensitive flags
- Variables for GCP config, image URI, secrets, resource sizing, etc.

### `main.tf`
- **Creates the service account** that Cloud Run uses
- **Grants permissions** to pull images from Artifact Registry
- **Defines Cloud Run service** with:
  - Container image from Artifact Registry
  - Environment variables (MongoDB, JWT secrets, etc.)
  - Resource limits (memory, CPU)
  - Auto-scaling settings (min/max instances)
- **Makes service public** (via IAM role `run.invoker`)

### `outputs.tf`
- Displays useful information after deployment (service URL, account email, etc.)

### `terraform.tfvars.example`
- Template for your actual configuration values
- Copy to `terraform.tfvars` and fill in your secrets

## How It Works (Step-by-Step)

### 1. **Local Setup**
```bash
cd terraform
cp terraform.tfvars.example terraform.tfvars
```

Edit `terraform.tfvars` with your values:
- GCP project ID
- Image URI (from Artifact Registry)
- MongoDB connection string
- JWT and approval token secrets

### 2. **Initialize Terraform**
```bash
terraform init
```
This downloads the Google provider and sets up the local working directory.

### 3. **Plan the Deployment**
```bash
terraform plan
```
Shows what resources will be created/changed. Review this output.

### 4. **Apply the Deployment**
```bash
terraform apply
```
Creates the Cloud Run service and all dependencies. Terraform will prompt for confirmation.

### 5. **Get the Service URL**
After apply, Terraform outputs:
```
cloud_run_url = "https://opus-xxxxx-us-south1.a.run.app"
```
This is your live OPUS deployment!

## Environment Variables

The Terraform config passes these to the container:

| Variable                | Set by             | Notes                              |
| ----------------------- | ------------------ | ---------------------------------- |
| `NODE_ENV`              | Terraform          | Always `production`                |
| `PORT`                  | Terraform          | Default `5000`                     |
| `MONGODB_URI`           | `terraform.tfvars` | Required: MongoDB Atlas URI        |
| `JWT_SECRET`            | `terraform.tfvars` | Required: Generated secret         |
| `APPROVAL_TOKEN_SECRET` | `terraform.tfvars` | Required: Generated secret         |
| `FRONTEND_URL`          | Terraform          | Auto-set to Cloud Run URL if empty |
| `BACKEND_URL`           | Terraform          | Auto-set to Cloud Run URL          |
| `COOKIE_SECURE`         | Terraform          | Always `true` (HTTPS only)         |
| `COOKIE_SAME_SITE`      | Terraform          | Always `lax`                       |
| `SMTP_USER`             | `terraform.tfvars` | Optional: for email                |
| `SMTP_PASS`             | `terraform.tfvars` | Optional: for email                |

## Security Notes

### Service Account
- Cloud Run runs under a dedicated service account
- Only has permission to pull images from Artifact Registry
- Cannot access other GCP resources

### Secrets
- MongoDB URI, JWT secret, approval token secret are **sensitive** in Terraform
- They're passed to Cloud Run via environment variables
- Do NOT commit `terraform.tfvars` to git (add to `.gitignore`)
- Use `terraform.tfvars.example` as the template

### Public Access
- Cloud Run service is public by default (IAM role `run.invoker` for `allUsers`)
- You can restrict this by removing the `google_cloud_run_service_iam_member` resource
- Or add authentication (requires code changes)

## Scaling

The Terraform config auto-scales Cloud Run:
- **Min instances**: 0 (saves money when idle)
- **Max instances**: 10 (prevents runaway costs)

Change in `terraform.tfvars`:
```hcl
min_instances = 1  # Always keep 1 running (costs more)
max_instances = 50 # Allow more concurrent traffic
```

## Database (MongoDB)

Cloud Run cannot reach private MongoDB servers. You must use:
- **MongoDB Atlas** (free tier available)
- Public IP with firewall rules allowing Cloud Run
- Or a VPC connector (more complex setup)

Get connection string from MongoDB Atlas dashboard:
```
mongodb+srv://username:password@cluster.mongodb.net/opus?retryWrites=true&w=majority
```

## State Management

By default, Terraform stores state locally in `terraform.tfstate`.

For teams, use **Cloud Storage backend** (uncomment in `provider.tf`):

```bash
# Create a storage bucket
gsutil mb gs://your-org-terraform-state

# Update provider.tf backend block
# Then run: terraform init
```

This ensures everyone uses the same state file.

## Updating the Deployment

When you push a new image to Artifact Registry:

1. Update the `image_uri` in `terraform.tfvars`
2. Run:
   ```bash
   terraform plan
   terraform apply
   ```

Or automate via GitHub Actions (next step).

## Troubleshooting

### "Permission denied" when applying
- Ensure your GCP user has `Editor` or `Owner` role
- Run `gcloud auth login` to re-authenticate

### Cloud Run service won't start
- Check logs: `gcloud run logs read opus --region us-south1 --limit 50`
- Verify MongoDB URI is correct
- Ensure secrets are set in `terraform.tfvars`

### Image pull fails
- Verify Artifact Registry image URI is correct
- Check the service account has `Artifact Registry Reader` role

## Next Steps

1. **Run Terraform locally** to test
2. **Add state to Cloud Storage** for team collaboration
3. **Integrate with GitHub Actions** to auto-deploy on image push
4. **Set up database migrations** (Cloud SQL, managed MongoDB)
5. **Add monitoring** (Cloud Logging, Cloud Monitoring)

## Useful Commands

```bash
# Show current state
terraform show

# List all resources
terraform state list

# Get details of a resource
terraform state show google_cloud_run_service.opus

# Destroy everything (careful!)
terraform destroy

# Format code
terraform fmt -recursive
```
