import { NextResponse } from 'next/server';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand } from "@aws-sdk/lib-dynamodb";
import { S3Client, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// Initialize AWS clients
const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.AWS_REGION }));
const s3Client = new S3Client({ region: process.env.AWS_REGION });

// --- GET Function: Fetches results and creates a secure URL ---
export async function GET(request: Request) {
    const { searchParams } = new URL(request.url);
    const imageId = searchParams.get("id");

    if (!imageId) {
        return NextResponse.json({ error: 'Image ID is required' }, { status: 400 });
    }

    const command = new GetCommand({
        TableName: process.env.DYNAMODB_TABLE_NAME,
        Key: { imageId },
    });

    try {
        const { Item } = await ddbDocClient.send(command);
        if (!Item) {
            return NextResponse.json({ error: 'Result not found' }, { status: 404 });
        }

        const processedImageKey = Item.s3_processed_key;
        if (!processedImageKey) {
            throw new Error("Processed image key not found in database item.");
        }

        const s3Command = new GetObjectCommand({
            Bucket: Item.s3_bucket,
            Key: processedImageKey,
        });

        const processed_image_url = await getSignedUrl(s3Client, s3Command, { expiresIn: 60 });

        return NextResponse.json({
            ...Item,
            processed_image_url,
        });
    } catch (error) {
        console.error("GET Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}

// --- DELETE Function: Cleans up the processed image ---
export async function DELETE(request: Request) {
    const { processedImageKey, bucket } = await request.json();

    if (!processedImageKey || !bucket) {
        return NextResponse.json({ error: 'Processed key and bucket are required' }, { status: 400 });
    }

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: processedImageKey,
    });

    try {
        await s3Client.send(command);
        console.log(`Successfully deleted temporary file: ${processedImageKey}`);
        return NextResponse.json({ message: 'Cleanup successful' });
    } catch (error) {
        console.error("DELETE Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
