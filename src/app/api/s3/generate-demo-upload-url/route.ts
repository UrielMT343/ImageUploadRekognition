import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { s3Client } from "@/lib/s3";

export async function POST(request: Request) {
  const { filename, contentType } = await request.json();

  const MAX_SIZE_MB = 10;
  const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "Filename and content type are required" },
      { status: 400 }
    );
  }

  try {
    const client = s3Client;

    const key = `uploads/demo/${uuidv4()}-${filename}`;

    const { url, fields } = await createPresignedPost(client, {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      Conditions: [
        ["content-length-range", 0, MAX_SIZE_BYTES],
        ["eq", "$Content-Type", contentType],
      ],
      Fields: {
        "Content-Type": contentType,
      },
      Expires: 600,
    });

    return NextResponse.json({ url, fields, key });
  } catch (error) {
    console.error("Error creating presigned URL:", error);

    if (error instanceof Error) {
      return NextResponse.json(
        { error: error.message },
        { status: 500 });
    }

    return NextResponse.json(
      { error: "Internal Server Error" },
      { status: 500 }
    );
  }
}
