import { NextRequest, NextResponse } from "next/server";
import { ddbDocClient } from '@/lib/dynamo';
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from '@/lib/s3';
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth"

type RecentImage = {
    key: string;
    url: string;
    lastModified: string;
    imageId: string;
};

type RecentResponse = {
    items: RecentImage[];
    nextCursor?: string;
};

function decodeCursor(cursor: string | null) {
    if (!cursor) return undefined;
    try { return JSON.parse(Buffer.from(cursor, "base64").toString("utf8")); }
    catch { return undefined; }
}

function encodeCursor(leKey: unknown) {
    return Buffer.from(JSON.stringify(leKey ?? null), "utf8").toString("base64");
}

export async function GET(req: NextRequest) {
    const session = await getServerSession(authOptions);
    if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

    const username = session.user.username;
    if (!username) return new NextResponse("No username in session", { status: 400 });

    const { searchParams } = new URL(req.url);
    const limit = Math.min(Number(searchParams.get("limit") ?? 20), 50);
    const cursor = decodeCursor(searchParams.get("cursor"));

    const DynamoDBTable = process.env.DYNAMODB_TABLE_NAME as string;
    if (!DynamoDBTable) return new NextResponse("Missing DDB_IMAGES_TABLE", { status: 500 });

    const scanInput = {
        TableName: DynamoDBTable,
        ProjectionExpression: "#id, #thumb, #ts, #user, #proc",
        FilterExpression: "#user = :u",
        ExpressionAttributeNames: {
            "#id": "imageId",
            "#thumb": "s3_thumbnail_key",
            "#ts": "processing_timestamp",
            "#user": "username",
            "#proc": "s3_processed_key",
        },
        ExpressionAttributeValues: { ":u": username },
        Limit: limit,
        ExclusiveStartKey: cursor,
    };

    const scan = new ScanCommand(scanInput);

    const { Items = [], LastEvaluatedKey } = await ddbDocClient.send(scan);

    type Row = {
        imageId: string;
        s3_thumbnail_key: string;
        s3_processed_key: string;
        processing_timestamp: string;
        username: string;
    };

    const rows = (Items ?? []) as Row[];
    rows.sort((a, b) => b.processing_timestamp.localeCompare(a.processing_timestamp));

    const bucket = process.env.S3_BUCKET_NAME;
    if (!bucket) return new NextResponse("Missing S3 bucket", { status: 500 });

    const items: RecentImage[] = await Promise.all(
        Items.map(async (it) => {
            const Key = it.s3_thumbnail_key as string;
            const url = await getSignedUrl(
                s3Client,
                new GetObjectCommand({ Bucket: bucket, Key }),
                { expiresIn: 60 }
            );
            return {
                key: Key,
                url,
                lastModified: it.processing_timestamp,
                imageId: it.imageId,
                processedKey: it.s3_processed_key,
            };
        })
    );

    const body: RecentResponse = {
        items,
        nextCursor: LastEvaluatedKey ? encodeCursor(LastEvaluatedKey) : undefined,
    };

    return NextResponse.json(body, { headers: { "Cache-Control": "no-store" } });
}