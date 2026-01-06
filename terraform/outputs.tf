# S3
output "s3_bucket_id" {
  description = "The name/ID of the created S3 bucket."
  value       = aws_s3_bucket.image_bucket.id
}

output "s3_bucket_arn" {
  description = "S3 bucket ARN"
  value       = aws_s3_bucket.image_bucket.arn
}

# DynamoDB
output "dynamodb_table_name" {
  description = "DynamoDB table storing analysis results"
  value       = aws_dynamodb_table.results_table.name
}

output "dynamodb_table_arn" {
  description = "DynamoDB table ARN"
  value       = aws_dynamodb_table.results_table.arn
}

# Cognito
output "cognito_user_pool_id" {
  description = "Cognito User Pool ID"
  value       = aws_cognito_user_pool.user_pool.id
}

output "cognito_user_pool_client_id" {
  description = "Cognito User Pool App Client ID"
  value       = aws_cognito_user_pool_client.user_pool_client.id
}

output "cognito_domain" {
  description = "Cognito hosted domain prefix"
  value       = aws_cognito_user_pool_domain.user_pool_domain.domain
}

output "cognito_issuer_url" {
  description = "OIDC issuer URL for NextAuth Cognito provider"
  value       = "https://cognito-idp.${var.aws_region}.amazonaws.com/${aws_cognito_user_pool.user_pool.id}"
}

output "cognito_hosted_ui_base_url" {
  description = "Base URL for Cognito Hosted UI (if you use it)"
  value       = "https://${aws_cognito_user_pool_domain.user_pool_domain.domain}.auth.${var.aws_region}.amazoncognito.com"
}

# Lambdas (debugging / wiring)
output "rekognition_lambda_name" {
  description = "Rekognition Lambda function name"
  value       = aws_lambda_function.rekognition_lambda.function_name
}

output "rekognition_lambda_arn" {
  description = "Rekognition Lambda ARN"
  value       = aws_lambda_function.rekognition_lambda.arn
}

output "trigger_ecs_lambda_name" {
  description = "ECS trigger Lambda function name"
  value       = aws_lambda_function.trigger_ecs_lambda.function_name
}

output "trigger_ecs_lambda_arn" {
  description = "ECS trigger Lambda ARN"
  value       = aws_lambda_function.trigger_ecs_lambda.arn
}

# SQS
output "enhance_queue_url" {
  description = "SQS queue URL for enhanced image processing"
  value       = aws_sqs_queue.enhance_image_queue.id
}

output "enhance_queue_arn" {
  description = "SQS queue ARN"
  value       = aws_sqs_queue.enhance_image_queue.arn
}

# ECS
output "ecs_cluster_name" {
  description = "ECS cluster name"
  value       = aws_ecs_cluster.image_processing.name
}

output "ecs_cluster_arn" {
  description = "ECS cluster ARN"
  value       = aws_ecs_cluster.image_processing.arn
}

output "ecs_task_definition_arn" {
  description = "ECS task definition ARN"
  value       = aws_ecs_task_definition.image_processing.arn
}
