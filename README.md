# Image Label Generator

An event-driven image processing platform that allows users to upload images, optionally enhance them, and automatically generate labels and bounding boxes using AWS Rekognition. The system is designed with scalability, security, and cost-efficiency in mind, leveraging serverless and container-based workloads.

## Fetaures
- Secure direct image uploads to S3 using presigned POST URLs
- Asynchronous image processing via event-driven architecture
- Optional image enhancement using ECS Fargate for compute-heavy workloads
- Automated label and bounding box detection using AWS Rekognition
- User authentication via Amazon Cognito and NextAuth
- Per-user and global rate limiting to prevent abuse
- Fully reproducible infrastructure using Terraform (IaC)

## Architecture overview
<img width="885" height="753" alt="image" src="https://github.com/user-attachments/assets/b3a194ec-40ee-4171-b865-a46c7a876913" />

1. **Frontend (Next.js on Vercel)**
  - Authenticated users request a presigned upload URL
  - Images are uploaded directly to S3 (no backend proxy)

2. **Upload & Processing**
  - S3 ObjectCreated events trigger downstream processing
  - Optional enhancement path:
    - Lambda triggers an on-demand ECS Fargate task
    - Enhanced image is written back to S3

3. **Analysis**
  - S3 events enqueue messages to SQS
  - Rekognition Lambda consumes messages, runs label detection
  - Results are stored in DynamoDB and accessible via API

4. **Security & Control**
  - IAM roles are scoped by responsibility (Lambda, ECS execution, ECS task)
  - Rate limiting enforced via Vercel WAF and per-user server-side limits

## Tech Stack
### Frontend
- Next.Js (App Router)
- NextAuth
- Deployed on Vercel

### Backend / Cloud
- AWS S3 (storage, event source)
- AWS Lambda (orchestration, analysis)
- AWS Rekognition (image labeling)
- AWS SQS (decoupling and buffering)
- AWS ECS Fargate (image enhancement workloads)
- AWS DynamoDB (results storage)
- Amazon Cognito (authentication)

### Infrastructure
- Terraform (Infrastructure as Code)

## Getting started
### Prerequisites

- AWS account
- Terraform ≥ 1.6
- Node.js ≥ 18
- Vercel account (for frontend deployment)

### Terraform Setup
```
cd terraform
terraform init
terraform apply
```

After apply, Terraform will output values such as:

- S3 bucket name
- DynamoDB table name
- Cognito User Pool ID and Client ID
- Cognito Issuer URL
- Lambda and ECS resource identifiers

*These outputs are required for application configuration.*

## Enviroment variables

### Frontend (Vercel/.env.local)

```
NEXTAUTH_URL=https://your-app.vercel.app
NEXTAUTH_SECRET=your-secret

COGNITO_CLIENT_ID=from_terraform_output
COGNITO_CLIENT_SECRET=from_cognito
COGNITO_ISSUER=from_terraform_output

AWS_REGION=us-east-1
DYNAMODB_TABLE_NAME=your-daynamo-table
S3_BUCKET_NAME=your-s3-bucket
```

### Frontend (Vercel/.env.local)

```
pnpm install
pnpm run dev
```

*The app will be available at http://localhost:3000.*

### Security Considerations

- Large file uploads are never proxied through the backend.
- IAM roles follow the principle of least privilege.
- Authentication and authorization handled by Cognito.
- Abuse prevention via:
  - Vercel WAF rate limiting.
  - Per-user server-side throttling.

### CI / CD

- GitHub Actions for linting, type checking, and build validation
- Path-based CI execution to avoid unnecessary builds.
- Vercel Git integration for preview and production deployments.
- Ignored Build Step configured to deploy only when relevant source files change.
- PR checks for both go backend and esrgan images.
- Automatic build and push for changes of the ECR images.

### Notes
- ECS tasks are launched on-demand to minimize cost
- The system is designed to be easily extended (additional processors, new pipelines)
- All infrastructure is fully reproducible via Terraform
