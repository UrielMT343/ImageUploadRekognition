variable "s3_bucket_name" {
  description = "The name of the S3 bucket where images will be uploaded."
  type        = string
  default = "rekognition-image-uploads-uriel-unique"
}

variable "dynamodb_table_name" {
  description = "The name of the DynamoDB table for the Rekognition results."
  type        = string
  default     = "RekognitionResultsTable"
}

variable "lambda_function_name" {
  description = "The name of the Lambda function that processes the images."
  type        = string
  default     = "RekognitionImageProcessor"
}