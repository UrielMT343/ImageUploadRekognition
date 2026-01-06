variable "aws_region" {
  description = "The name of the AWS region."
  type        = string
  default     = "us-east-1"
}

variable "esrgan_image" {
  description = "The name of the ESRGAN image."
  type        = string
  default     = "public.ecr.aws/g2w8y5i5/imagel-label-generator/esgarn-service"
}

variable "go_backend_image" {
  description = "The name of the Go backend image."
  type        = string
  default     = "public.ecr.aws/g2w8y5i5/image-label-generator/go-backen"
}

variable "s3_bucket_name" {
  description = "The name of the S3 bucket where images will be uploaded."
  type        = string
  default     = "rekognition-image-uploads-uriel-unique"
}

variable "dynamodb_table_name" {
  description = "The name of the DynamoDB table for the Rekognition results."
  type        = string
  default     = "RekognitionResultsTable"
}

variable "rekognition_lambda_name" {
  description = "The name of the Lambda function that processes the images."
  type        = string
  default     = "RekognitionImageProcessor"
}

variable "trigger_ecs_lambda_name" {
  description = "The name of the Lambda function that triggers the ECS task."
  type        = string
  default     = "TriggerECSTask"
}

variable "app_base_url" {
  description = "The base URL of the application."
  type        = string
  default     = "https://example.com"
}

variable "local_base_url" {
  description = "The base URL of the local development environment."
  type        = string
  default     = "http://localhost:3000"
}
