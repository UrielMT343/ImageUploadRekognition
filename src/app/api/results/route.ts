import { NextResponse } from 'next/server';
import { s3Client } from '@/lib/s3';
import { ddbDocClient } from '@/lib/dynamo';
import { GetCommand } from "@aws-sdk/lib-dynamodb";
import { GetObjectCommand, DeleteObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { isS3NotFoundError } from "../../../../types/errorUtils";

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
            console.log("[API] No item found for imageId:", imageId);
            return NextResponse.json({ error: 'Result not found' }, { status: 404 });
        }

        const processedImageKey = Item.s3_processed_key;
        if (!processedImageKey) {
            throw new Error("Processed image key not found in database item.");
        }

        const headCommand = new HeadObjectCommand({
            Bucket: Item.s3_bucket,
            Key: processedImageKey,
        });

        try {
            await s3Client.send(headCommand);
        } catch (err: unknown) {
            console.log("[API] Failed headObject for key:", processedImageKey);
            if (isS3NotFoundError(err)) {
                return NextResponse.json({ error: 'Image not yet ready' }, { status: 404 });
            }
            throw err;
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

export async function DELETE(request: Request) {
    const { originalImageKey, bucket } = await request.json();

    if (!originalImageKey || !bucket) {
        return NextResponse.json({ error: 'Processed key and bucket are required' }, { status: 400 });
    }

    const command = new DeleteObjectCommand({
        Bucket: bucket,
        Key: originalImageKey,
    });

    try {
        await s3Client.send(command);
        console.log(`Successfully deleted temporary file: ${originalImageKey}`);
        return NextResponse.json({ message: 'Cleanup successful' });
    } catch (error) {
        console.error("DELETE Error:", error);
        return NextResponse.json({ error: (error as Error).message }, { status: 500 });
    }
}
