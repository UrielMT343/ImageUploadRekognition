// src/app/api/results/[imageId]/route.ts
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand } from '@aws-sdk/lib-dynamodb';
import { NextResponse } from 'next/server';

const client = new DynamoDBClient({ region: process.env.AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

export async function GET(
  request: Request,
  // We are ignoring the second argument now to avoid the error
) {
  // Create a URL object to easily parse it
  const url = new URL(request.url);
  // The imageId is the last part of the path
  const imageIdEncoded = url.pathname.split('/').pop()!;
  const imageId = decodeURIComponent(imageIdEncoded);

  const command = new GetCommand({
    TableName: process.env.DYNAMODB_TABLE_NAME!,
    Key: { imageId: imageId },
    ConsistentRead: true,
  });

  try {
    const response = await docClient.send(command);
    if (response.Item) {
      return NextResponse.json(response.Item);
    } else {
      return NextResponse.json({ error: 'Results not found.' }, { status: 404 });
    }
  } catch (error) {
    console.error('Error fetching from DynamoDB:', error);
    return NextResponse.json({ error: 'Failed to fetch results from DynamoDB.' }, { status: 500 });
  }
}