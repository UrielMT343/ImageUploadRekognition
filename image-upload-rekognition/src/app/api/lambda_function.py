import json
import boto3
import os
import urllib.parse
import datetime
from decimal import Decimal
from PIL import Image

rekognition_client = boto3.client('rekognition')
dynamodb_resource = boto3.resource('dynamodb')

MIN_CONFIDENCE = int(os.environ.get('MIN_CONFIDENCE', '75'))
MAX_LABELS = int(os.environ.get('MAX_LABELS', '10'))

def lambda_handler(event, context):
    bucket_name = event['Records'][0]['s3']['bucket']['name']
    object_key_encoded = event['Records'][0]['s3']['object']['key']
    object_key = urllib.parse.unquote_plus(object_key_encoded)

    table_name = os.environ.get('DYNAMODB_TABLE_NAME', 'ImageAnalysisResults')
    table = dynamodb_resource.Table(table_name)

    print(f"Processing image: s3://{bucket_name}/{object_key}")
    print(f"Successfully imported Pillow! Version: {Image.__version__}")

    detected_labels_info = []

    try:
        response = rekognition_client.detect_labels(
            Image={
                'S3Object': {
                    'Bucket': bucket_name,
                    'Name': object_key
                }
            },
            MaxLabels=MAX_LABELS,
            MinConfidence=float(MIN_CONFIDENCE)
        )

        labels_from_rekognition = response.get('Labels', [])

        if not labels_from_rekognition:
            print(f"No labels found for image: s3://{bucket_name}/{object_key}")
            return {
                'statusCode': 200,
                'body': json.dumps({'message': 'No labels found', 'detected_objects': []})
            }
        else:
            print(f"Labels found for image: s3://{bucket_name}/{object_key}")
            for label_data in labels_from_rekognition:
                label_name = label_data.get('Name')
                label_confidence = label_data.get('Confidence')

                if not (label_name and label_confidence is not None):
                    print(f"  Skipping a label due to missing name or confidence: {label_data}")
                    continue

                print(f"  Processing Label: {label_name}, Confidence: {label_confidence:.2f}%")

                if 'Instances' in label_data and len(label_data['Instances']) > 0:
                    print(f"    Found {len(label_data['Instances'])} instance(s) of {label_name}:")
                    for instance in label_data['Instances']:
                        instance_confidence = instance.get('Confidence')

                        if 'BoundingBox' in instance and instance['BoundingBox'] is not None:
                            bbox = instance['BoundingBox']

                            box_width = bbox.get('Width')
                            box_height = bbox.get('Height')
                            box_left = bbox.get('Left')
                            box_top = bbox.get('Top')

                            if all(v is not None for v in [box_width, box_height, box_left, box_top, instance_confidence]):
                                print(f"      Instance Confidence: {instance_confidence:.2f}%")
                                print(f"      BoundingBox: Left={box_left:.4f}, Top={box_top:.4f}, Width={box_width:.4f}, Height={box_height:.4f}")
                                
                                object_info = {
                                    'Label': label_name,
                                    'Confidence': Decimal(str(instance_confidence)),
                                    'BoundingBox': {
                                        'Width': Decimal(str(box_width)),
                                        'Height': Decimal(str(box_height)),
                                        'Left': Decimal(str(box_left)),
                                        'Top': Decimal(str(box_top))
                                    }
                                }
                                detected_labels_info.append(object_info)
                            else:
                                print(f"      Instance of {label_name} is missing BoundingBox coordinates or instance confidence.")
                        else:
                            print(f"      Instance of {label_name} does not have a BoundingBox.")
            
            timestamp = datetime.datetime.utcnow().isoformat() + 'Z'

            item_to_store = {
                'imageId': object_key,
                's3_bucket': bucket_name,
                'processing_timestamp': timestamp,
                'original_image_url': f"https://{bucket_name}.s3.{os.environ['AWS_REGION']}.amazonaws.com/{object_key}",
                'detected_objects': detected_labels_info # The list with Decimal objects
            }

            table.put_item(Item=item_to_store)

            print(f"Successfully stored results for: {object_key} in DynamoDB")

            return {
                'statusCode': 200,
                'body': json.dumps({
                    'image_processed': f"s3://{bucket_name}/{object_key}",
                    'detected_objects': detected_labels_info,
                    'message': 'Image processed by Rekognition successfully'
                }, default = str)
            }
    except Exception as e:
        print(f"Error processing image: {object_key} from bucket {bucket_name} with Rekognition")
        print(str(e))
        import traceback
        traceback.print_exc()
        return {
            'statusCode': 500,
            'body': json.dumps({'error': str(e), 'image': f"s3://{bucket_name}/{object_key}"})
        }