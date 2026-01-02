import json
import boto3
import os
import urllib.parse

# --- AWS Client Initialization ---
s3_client = boto3.client('s3')
ecs_client = boto3.client('ecs')

def lambda_handler(event, context):

    bucket_name = event['Records'][0]['s3']['bucket']['name']
    original_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])

    cluster_name = "your-cluster-name"
    task_definition = "your-task-definition:revision" 

    print(f"Processing image: s3://{bucket_name}/{original_key}")

    try:
        response = ecs_client.run_task(
            cluster = cluster_name,
            launchType = "FARGATE",
            taskDefinition = task_definition, 
            count = 1,
            platformVersion="LATEST",
            networkConfiguration={
                "awsvpcConfiguration": {
                    "subnets": ["your-subnet"],
                    "securityGroups":["your-security-group"],
                    "assignPublicIp": "ENABLED"
                }
            }
        ,overrides={
                "containerOverrides": [
                    {
                        "name": "go-backend",
                        "environment": [
                            {"name": "INPUT_KEY", "value": original_key},
                            {"name": "BUCKET", "value": bucket_name},
                        ]
                    }
                ]
            }
        )
        print(response)
        return{
            'statusCode': 200,
            'body': json.dumps('Succesfully initiated ECS')
        }
    except Exception as e:
        print(e)
        return {
            'statusCode': 500,
            'body': str(e)
        }    