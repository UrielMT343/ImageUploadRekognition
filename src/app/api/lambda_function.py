import json
import boto3
import os
import urllib.parse
import datetime
from decimal import Decimal
import io
from PIL import Image

# --- AWS Client Initialization ---
rekognition_client = boto3.client('rekognition')
dynamodb_resource = boto3.resource('dynamodb')
s3_client = boto3.client('s3')

# --- Environment Variables & Constants ---
MIN_CONFIDENCE = int(os.environ.get('MIN_CONFIDENCE', '75'))
MAX_LABELS = int(os.environ.get('MAX_LABELS', '10'))
TABLE_NAME = os.environ.get('DYNAMODB_TABLE_NAME', 'ImageAnalysisResults')
DYNAMODB_TABLE = dynamodb_resource.Table(TABLE_NAME)

# --- Image Processing Constants ---
THUMBNAIL_SIZE = (200, 200)
ANALYSIS_WIDTH = 800

def lambda_handler(event, context):
    # 1. Get Event Data
    bucket_name = event['Records'][0]['s3']['bucket']['name']
    original_key = urllib.parse.unquote_plus(event['Records'][0]['s3']['object']['key'])

    # --- Define keys for all image versions ---
    filename = os.path.basename(original_key)
    thumbnail_key = f"thumbnails/{filename}"
    processed_key = f"processed/{filename}" 

    print(f"Processing image: s3://{bucket_name}/{original_key}")

    try:
        # 2. Download original image from S3
        response = s3_client.get_object(Bucket=bucket_name, Key=original_key)
        image_bytes = response['Body'].read()

        # --- Generate and Upload Thumbnail ---
        with Image.open(io.BytesIO(image_bytes)) as image:
            image.thumbnail(THUMBNAIL_SIZE)
            thumbnail_buffer = io.BytesIO()
            image.save(thumbnail_buffer, format="JPEG", quality=90)
            thumbnail_buffer.seek(0)
            s3_client.put_object(
                Bucket=bucket_name, Key=thumbnail_key, Body=thumbnail_buffer, ContentType='image/jpeg'
            )
            print(f"Successfully created thumbnail: s3://{bucket_name}/{thumbnail_key}")

        # --- Standardize image for analysis ---
        with Image.open(io.BytesIO(image_bytes)) as image:
            original_width, original_height = image.size
            aspect_ratio = original_height / original_width
            analysis_height = int(ANALYSIS_WIDTH * aspect_ratio)
            analysis_image = image.resize((ANALYSIS_WIDTH, analysis_height), Image.Resampling.LANCZOS)
            analysis_buffer = io.BytesIO()
            analysis_image.save(analysis_buffer, format="JPEG", quality=95)
            analysis_buffer.seek(0)
            s3_client.put_object(
                Bucket=bucket_name, Key=processed_key, Body=analysis_buffer, ContentType='image/jpeg'
            )
            print(f"Created standardized image for analysis: s3://{bucket_name}/{processed_key}")

        # 3. Call Rekognition on the standardized image
        response = rekognition_client.detect_labels(
            Image={'S3Object': {'Bucket': bucket_name, 'Name': processed_key}},
            MaxLabels=MAX_LABELS,
            MinConfidence=float(MIN_CONFIDENCE)
        )

        # 4. Process Rekognition response
        detected_labels_info = []
        labels_from_rekognition = response.get('Labels', [])
        if labels_from_rekognition:
            for label_data in labels_from_rekognition:
                if 'Instances' in label_data and len(label_data['Instances']) > 0:
                    for instance in label_data['Instances']:
                        if 'BoundingBox' in instance and instance.get('Confidence') is not None:
                            detected_labels_info.append({
                                'Label': label_data.get('Name'),
                                'Confidence': Decimal(str(instance['Confidence'])),
                                'BoundingBox': {k: Decimal(str(v)) for k, v in instance['BoundingBox'].items()}
                            })
        
        # 5. Store all keys in DynamoDB
        item_to_store = {
            'imageId': original_key, 
            's3_bucket': bucket_name,
            's3_original_key': original_key,
            's3_thumbnail_key': thumbnail_key,
            's3_processed_key': processed_key,
            'processing_timestamp': datetime.datetime.utcnow().isoformat() + 'Z',
            'detected_objects': detected_labels_info
        }
        DYNAMODB_TABLE.put_item(Item=item_to_store)
        print(f"Successfully stored results for: {original_key} in DynamoDB")
        return {'statusCode': 200, 'body': json.dumps({'message': 'Image processed successfully!'})}

    except Exception as e:
        print(f"Error processing image: {original_key}")
        import traceback
        traceback.print_exc()
        # Note: We don't do cleanup here anymore.
        return {'statusCode': 500, 'body': json.dumps({'error': str(e)})}