# CI/CD Workflow for OPUS

This repository uses GitHub Actions for pull-request validation and for publishing Docker images to Google Artifact Registry from `main`.

## Pull request checks

The PR workflow runs:
- `npm ci` at the root
- `npm ci --prefix backend`
- `npm ci --prefix frontend`
- backend unit tests via `npm run test:unit --prefix backend`
- frontend build via `npm run build --prefix frontend`

## Main branch publish flow

After a PR is approved and merged into `main`, the publish workflow:
- repeats the validation steps
- authenticates to Google Cloud using Workload Identity Federation
- configures Docker for Artifact Registry
- builds the repository Docker image
- pushes the image tagged with the commit SHA and `latest`

## Required GitHub settings

Add these repository variables:
- `GCP_PROJECT_ID`
- `GAR_LOCATION`
- `GAR_REPOSITORY`
- `IMAGE_NAME`

Add these repository secrets:
- `GCP_WORKLOAD_IDENTITY_PROVIDER`
- `GCP_SERVICE_ACCOUNT_EMAIL`

## Example Artifact Registry image path

```text
us-central1-docker.pkg.dev/PROJECT_ID/REPOSITORY/IMAGE_NAME:latest
```
#This line is just for sample
## Notes

The Docker image build uses the repository root `Dockerfile`, which already builds the frontend and serves it from the Node backend.
