# S3 bucket for original/enhanced/processed images. Direct upload uses presigned POST
resource "aws_s3_bucket" "image_bucket" {
  bucket = var.s3_bucket_name

  tags = {
    Name      = "Rekognition Image Bucket"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

# DynamoDB table for storing results and metadata of the uploaded images
resource "aws_dynamodb_table" "results_table" {
  name         = var.dynamodb_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "imageId"

  attribute {
    name = "imageId"
    type = "S"
  }

  tags = {
    Name      = "Rekognition Results Table"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

# Lambda execution role for Rekognition Lambda
resource "aws_iam_role" "lambda_exec_role" {
  name = "RekognitionLambdaRole"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

resource "aws_iam_role_policy_attachment" "name" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

data "aws_lambda_layer_version" "pillow_layer" {
  layer_name = "Pillow_Layer"
}

# Set the Rekognition lambda from the file
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "../src/app/api/lambda_function.py"
  output_path = "lambda_function.zip"
}

# Rekognition Lambda, consumes uploaded images and performs image analysis using AWS Rekognition, writing results to DynamoDB
resource "aws_lambda_function" "rekognition_lambda" {
  function_name = var.rekognition_lambda_name
  role          = aws_iam_role.lambda_exec_role.arn

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  handler = "rekognition_lambda.lambda_handler"
  runtime = "python3.13"

  memory_size = 1024
  timeout     = 30

  environment {
    variables = {
      S3_BUCKET_NAME      = aws_s3_bucket.image_bucket.bucket
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.results_table.name
      APP_AWS_REGION      = var.aws_region
    }
  }

  layers = [data.aws_lambda_layer_version.pillow_layer.arn]

  tags = {
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

# Create a custom IAM policy for the Lambda function
resource "aws_iam_policy" "lambda_permissions" {
  name        = "RekognitionLambdaPermissionsPolicy"
  description = "Permissions for the Rekognition Lambda to access S3, DynamoDB, and Rekognition"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ],
        Effect   = "Allow",
        Resource = "${aws_s3_bucket.image_bucket.arn}/*"
      },
      {
        Action   = "dynamodb:PutItem",
        Effect   = "Allow",
        Resource = aws_dynamodb_table.results_table.arn
      },
      {
        Action   = "rekognition:DetectLabels",
        Effect   = "Allow",
        Resource = "*"
      }
    ]
  })
}

# Attach our new custom policy to the Lambda's execution role
resource "aws_iam_role_policy_attachment" "lambda_custom_permissions" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = aws_iam_policy.lambda_permissions.arn
}

# Grant permission for the S3 service to invoke our Lambda function
resource "aws_lambda_permission" "allow_s3" {
  statement_id  = "AllowS3Invoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.rekognition_lambda.function_name
  principal     = "s3.amazonaws.com"
  source_arn    = aws_s3_bucket.image_bucket.arn
}

# Create an S3 bucket notification to trigger the Lambda function on object creation
resource "aws_s3_bucket_notification" "image_upload_notification" {
  bucket = aws_s3_bucket.image_bucket.id

  lambda_function {
    lambda_function_arn = aws_lambda_function.rekognition_lambda.arn
    events              = ["s3:ObjectCreated:*"]
    filter_prefix       = "uploads/"
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

#Cognito User Pool for user authentication
resource "aws_cognito_user_pool" "ImageLabelGenerator" {
  name = "ImageLabelGeneratorUserPool"

  tags = {
    Name      = "ImageLabelGeneratorUserPool"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

# Cognito User Pool Client for the application
resource "aws_cognito_user_pool_client" "ImageLabelGeneratorClient" {
  name                                 = "ImageLabelGeneratorClient"
  user_pool_id                         = aws_cognito_user_pool.ImageLabelGenerator.id
  explicit_auth_flows                  = ["ALLOW_USER_PASSWORD_AUTH", "ALLOW_REFRESH_TOKEN_AUTH", "ALLOW_USER_SRP_AUTH"]
  generate_secret                      = true
  allowed_oauth_flows                  = ["code"]
  allowed_oauth_scopes                 = ["openid", "email", "profile"]
  allowed_oauth_flows_user_pool_client = true

  callback_urls = [
    var.local_base_url + "/api/auth/callback/cognito",
    var.app_base_url + "/api/auth/callback/cognito"
  ]
  logout_urls = [
    var.local_base_url,
    var.app_base_url
  ]
}

#Create a Cognito User Pool Domain
resource "aws_cognito_user_pool_domain" "image_label_generator" {
  domain       = "image_label_generator"
  user_pool_id = aws_cognito_user_pool.ImageLabelGenerator.id
}

locals {
  aws_region         = var.aws_region
  ecs_log_group_name = aws_cloudwatch_log_group.ecs_image_processing.name
  esrgan_image       = var.esrgan_image
  go_backend_image   = var.go_backend_image
}

# Image processing cluster
resource "aws_ecs_cluster" "image_processing" {
  name = "image_processing"
  setting {
    name  = "containerInsights"
    value = "enabled"
  }
}

data "aws_iam_policy_document" "ecs_task_permissions" {
  statement {
    effect    = "Allow"
    actions   = ["s3:ListBucket"]
    resources = [aws_s3_bucket.image_bucket.arn]
  }

  # Read originals
  statement {
    effect  = "Allow"
    actions = ["s3:GetObject"]
    resources = [
      "${aws_s3_bucket.image_bucket.arn}/analysis/*"
    ]
  }

  statement {
    effect  = "Allow"
    actions = ["s3:PutObject", "s3:GetObject", "s3:DeleteObject"]
    resources = [
      "${aws_s3_bucket.image_bucket.arn}/enhanced/*"
    ]
  }

  statement {
    effect    = "Allow"
    actions   = ["dynamodb:GetItem"]
    resources = [aws_dynamodb_table.results_table.arn]
  }
}

resource "aws_iam_policy" "ecs_task_permissions" {
  name   = "ecs-task-permissions"
  policy = data.aws_iam_policy_document.ecs_task_permissions.json
}

resource "aws_iam_role_policy_attachment" "ecs_task_permissions_attach" {
  role       = aws_iam_role.ecs_task.name
  policy_arn = aws_iam_policy.ecs_task_permissions.arn
}

# ECS task definition for image processing, first starting the esrgan container enhancing the image and then the Go container uploading the enhanced image to S3
resource "aws_ecs_task_definition" "image_processing" {
  family                   = "image-processing"
  network_mode             = "awsvpc"
  requires_compatibilities = ["FARGATE"]
  cpu                      = "1024"
  memory                   = "8192"

  execution_role_arn = data.aws_iam_role.ecs_task_execution.arn
  task_role_arn      = data.aws_iam_role.ecs_task_execution.arn

  container_definitions = jsonencode([
    {
      name      = "esrgan"
      image     = local.esrgan_image
      essential = true
      cpu       = 512
      memory    = 7168

      portMappings = [
        {
          containerPort = 5000
          hostPort      = 5000
          protocol      = "tcp"
          appProtocol   = "http"
        }
      ]

      healthCheck = {
        command     = ["CMD-SHELL", "curl -f http://localhost:5000/health || exit 1"]
        interval    = 60
        retries     = 5
        startPeriod = 300
        timeout     = 30
      }

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.ecs_log_group_name
          awslogs-region        = local.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    },
    {
      name      = "go-backend"
      image     = local.go_backend_image
      essential = true
      cpu       = 512
      memory    = 1024

      dependsOn = [
        { containerName = "esrgan", condition = "HEALTHY" }
      ]

      logConfiguration = {
        logDriver = "awslogs"
        options = {
          awslogs-group         = local.ecs_log_group_name
          awslogs-region        = local.aws_region
          awslogs-stream-prefix = "ecs"
        }
      }
    }
  ])

  runtime_platform {
    cpu_architecture        = "X86_64"
    operating_system_family = "LINUX"
  }
}

# SQS queue for image processing
resource "aws_sqs_queue" "enhance_image_queue" {
  name                       = "enhance-image-queue"
  receive_wait_time_seconds  = 10
  visibility_timeout_seconds = 300
  message_retention_seconds  = 345600
  sqs_managed_sse_enabled    = true
}

data "aws_caller_identity" "current" {}

data "aws_iam_policy_document" "enhance_queue_policy" {
  statement {
    sid     = "AllowS3SendMessage"
    effect  = "Allow"
    actions = ["sqs:SendMessage"]

    principals {
      type        = "Service"
      identifiers = ["s3.amazonaws.com"]
    }

    resources = [aws_sqs_queue.enhance_image_queue.arn]

    condition {
      test     = "ArnLike"
      variable = "aws:SourceArn"
      values   = [aws_s3_bucket.image_bucket.arn]
    }

    condition {
      test     = "StringEquals"
      variable = "aws:SourceAccount"
      values   = [data.aws_caller_identity.current.account_id]
    }
  }
}

resource "aws_sqs_queue_policy" "enhance_queue_policy" {
  queue_url = aws_sqs_queue.enhance_image_queue.id
  policy    = data.aws_iam_policy_document.enhance_queue_policy.json
}

resource "aws_s3_bucket_notification" "enhanced_to_sqs" {
  bucket = aws_s3_bucket.image_bucket.id

  queue {
    queue_arn     = aws_sqs_queue.enhance_image_queue.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "enhanced/"
  }

  depends_on = [aws_sqs_queue_policy.enhance_queue_policy]
}

# Set the trigger ECS Lambda from file
data "archive_file" "trigger_ecs_lambda_zip" {
  type        = "zip"
  source_file = "../src/app/api/trigger_ecs_lambda.py"
  output_path = "trigger_ecs_lambda.zip"
}

# ECS trigger lambda starting the task to enhance the image in the ECS cluster
resource "aws_lambda_function" "trigger_ecs_lambda" {
  function_name = var.trigger_ecs_lambda_name
  role          = aws_iam_role.trigger_ecs_lambda_exec_role.arn

  filename         = data.archive_file.trigger_ecs_lambda_zip.output_path
  source_code_hash = data.archive_file.trigger_ecs_lambda_zip.output_base64sha256

  handler = "trigger_ecs_lambda.lambda_handler"
  runtime = "python3.13"

  memory_size = 512
  timeout     = 15

  tags = {
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

data "aws_iam_policy_document" "trigger_lambda_assume_role" {
  statement {
    effect  = "Allow"
    actions = ["sts:AssumeRole"]
    principals {
      type        = "Service"
      identifiers = ["lambda.amazonaws.com"]
    }
  }
}

resource "aws_iam_role" "trigger_ecs_lambda_exec_role" {
  name               = "trigger-ecs-lambda-exec-role"
  assume_role_policy = data.aws_iam_policy_document.trigger_lambda_assume_role.json
}

# Basic CloudWatch logs for Lambda
resource "aws_iam_role_policy_attachment" "trigger_lambda_basic_logs" {
  role       = aws_iam_role.trigger_ecs_lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_policy" "trigger_ecs_lambda_permissions" {
  name        = "TriggerEcsLambdaPermissionsPolicy"
  description = "Permissions for the trigger Lambda to run ECS tasks and pass task roles"

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid    = "RunEcsTask",
        Effect = "Allow",
        Action = [
          "ecs:RunTask"
        ],
        Resource = [
          aws_ecs_task_definition.image_processing.arn,
          aws_ecs_cluster.image_processing.arn
        ]
      },
      {
        Sid    = "PassTaskRoles",
        Effect = "Allow",
        Action = [
          "iam:PassRole"
        ],
        Resource = [
          aws_iam_role.ecs_task_execution.arn,
          aws_iam_role.ecs_task.arn
        ]
      },
      {
        Sid    = "DescribeTasksOptional",
        Effect = "Allow",
        Action = [
          "ecs:DescribeTasks"
        ],
        Resource = "*"
      }
    ]
  })
}

resource "aws_iam_role_policy_attachment" "trigger_ecs_lambda_custom_permissions" {
  role       = aws_iam_role.trigger_ecs_lambda_exec_role.name
  policy_arn = aws_iam_policy.trigger_ecs_lambda_permissions.arn
}
