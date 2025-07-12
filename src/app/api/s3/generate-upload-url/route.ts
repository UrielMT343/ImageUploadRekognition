// src/app/api/s3/generate-upload-url/route.ts

import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { S3Client } from "@aws-sdk/client-s3";
import { v4 as uuidv4 } from "uuid";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/app/api/auth/[...nextauth]/route";

export async function POST(request: Request) {
  const { filename, contentType } = await request.json();
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  if (!filename || !contentType) {
    return NextResponse.json(
      { error: "Filename and content type are required" },
      { status: 400 }
    );
  }

  console.log("API route '/api/s3/generate-upload-url' was hit. for user:", session.user?.username);

  try {
    const client = new S3Client({
      region: process.env.APP_AWS_REGION,
      credentials: {
        accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
        secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
      },
    });

    const key = `uploads/${session.user.username}/${uuidv4()}-${filename}`;

    const { url, fields } = await createPresignedPost(client, {
      Bucket: process.env.S3_BUCKET_NAME!,
      Key: key,
      Conditions: [
        ["content-length-range", 0, 10485760], // up to 10 MB
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
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    return NextResponse.json(
      { error: "An unknown error occurred" },
      { status: 500 }
    );
  }
}
