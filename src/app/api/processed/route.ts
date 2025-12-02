import { NextRequest, NextResponse } from "next/server";
import { ddbDocClient } from "@/lib/dynamo";
import { ScanCommand } from "@aws-sdk/lib-dynamodb";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { GetObjectCommand } from "@aws-sdk/client-s3";
import { s3Client } from "@/lib/s3";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

type Row = {
  s3_processed_key: string;
  detected_objects?: unknown;
  processing_timestamp: string;
  s3_bucket?: string;
  username: string;
};

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });

  const username = session.user.username;
  if (!username) return new NextResponse("No username in session", { status: 400 });

  const { key } = await req.json();
  if (typeof key !== "string" || !key) {
    return new NextResponse("Invalid key", { status: 400 });
  }

  const TableName = process.env.DYNAMODB_TABLE_NAME;
  if (!TableName) return new NextResponse("Missing DYNAMODB_TABLE_NAME", { status: 500 });

  let startKey: Record<string, unknown> | undefined;
  let found: Row | undefined;

  do {
    const resp = await ddbDocClient.send(
      new ScanCommand({
        TableName,
        ProjectionExpression: "#proc, #labels, #ts, #bucket, #user",
        FilterExpression: "#user = :u",
        ExpressionAttributeNames: {
          "#user": "username",
          "#proc": "s3_processed_key",
          "#labels": "detected_objects",
          "#ts": "processing_timestamp",
          "#bucket": "s3_bucket",
        },
        ExpressionAttributeValues: { ":u": username },
        ExclusiveStartKey: startKey,
      })
    );

    const rows = (resp.Items ?? []) as Row[];
    found = rows.find((r) => r.s3_processed_key === key);
    startKey = resp.LastEvaluatedKey;
  } while (!found && startKey);

  if (!found) return new NextResponse("Not found", { status: 404 });

  const bucket = process.env.S3_BUCKET_NAME || found.s3_bucket;
  if (!bucket) return new NextResponse("Missing S3 bucket", { status: 500 });

  const processedUrl = await getSignedUrl(
    s3Client,
    new GetObjectCommand({ Bucket: bucket, Key: found.s3_processed_key }),
    { expiresIn: 60 }
  );

  return NextResponse.json(
    {
      processedUrl,
      labels: found.detected_objects ?? [],
      processedAt: found.processing_timestamp,
    },
    { headers: { "Cache-Control": "no-store" } }
  );
}
