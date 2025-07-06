resource "aws_s3_bucket" "image_bucket" {
  bucket = var.s3_bucket_name

  tags = {
    Name      = "Rekognition Image Bucket"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

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

# Attach the basic AWS-managed policy for Lambda logging
resource "aws_iam_role_policy_attachment" "name" {
  role       = aws_iam_role.lambda_exec_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# Look up the existing Pillow Lambda Layer
data "aws_lambda_layer_version" "pillow_layer" {
  layer_name = "Pillow_Layer"
}

# Package the Lambda function code into a zip file
data "archive_file" "lambda_zip" {
  type        = "zip"
  source_file = "../src/app/api/lambda_function.py" # IMPORTANT: Update this path to your actual lambda python file!
  output_path = "lambda_function.zip"
}

#Create the Lambda function
resource "aws_lambda_function" "rekognition_lambda" {
  function_name = var.lambda_function_name
  role          = aws_iam_role.lambda_exec_role.arn

  filename         = data.archive_file.lambda_zip.output_path
  source_code_hash = data.archive_file.lambda_zip.output_base64sha256

  handler = "lambda_function.lambda_handler"
  runtime = "python3.13"

  memory_size = 1024 # Increase memory from 128MB to 1024MB (1GB). This will also increase CPU power.
  timeout     = 30   # Increase timeout to 30 seconds

  environment {
    variables = {
      S3_BUCKET_NAME      = aws_s3_bucket.image_bucket.bucket
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.results_table.name
      APP_AWS_REGION      = "us-east-1"
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

  # The policy document itself
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
        Resource = "${aws_s3_bucket.image_bucket.arn}/*" # Grant get, put, and delete permissions
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
    filter_prefix       = "uploads/" # Optional: Only trigger for objects in the 'uploads/' prefix
  }

  depends_on = [aws_lambda_permission.allow_s3]
}

# Create ECR public repository for the Docker image for Go backend
resource "aws_ecrpublic_repository" "go_backend_repo" {
  repository_name = "go-backend-repo"

  tags = {
    Name      = "Go Backend Repository"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
}

#  Create ECR puublic repository for the ESRGAN Docker image
resource "aws_ecrpublic_repository" "ESRGAN_repo" {
  repository_name = "esrgan-repo"

  tags = {
    Name      = "ESRGAN Repository"
    Project   = "Image-Upload-Rekognition"
    ManagedBy = "Terraform"
  }
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
    "http://localhost:3000/api/auth/callback/cognito",
    "https://your-vercel-app.vercel.app/api/auth/callback/cognito"
  ]
  logout_urls = [
    "http://localhost:3000/",
    "https://image-upload-rekognition.vercel.app/"
  ]
}

#Create a Cognito User Pool Domain
# This is used for the hosted UI for user authentication
resource "aws_cognito_user_pool_domain" "image-label-generator" {
  domain = "image-label-generator"
  user_pool_id = aws_cognito_user_pool.ImageLabelGenerator.id
}