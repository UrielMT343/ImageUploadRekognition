import { createPresignedPost } from "@aws-sdk/s3-presigned-post";
import { v4 as uuidv4 } from "uuid";
import { NextResponse, NextRequest } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { s3Client } from "@/lib/s3";
import { getToken } from "next-auth/jwt";
import { enhanceLimiter, enhanceDailyLimiter } from "@/lib/rateLimit";

export async function POST(request: NextRequest) {
    const { filename, contentType } = await request.json();

    const MAX_SIZE_MB = 10;
    const MAX_SIZE_BYTES = MAX_SIZE_MB * 1024 * 1024;

    const session = await getServerSession(authOptions);
    if (!session) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (!filename || !contentType) {
        return NextResponse.json(
            { error: "Filename and content type are required" },
            { status: 400 }
        );
    }

    const token = await getToken({
        req: request,
        secret: process.env.NEXTAUTH_SECRET,
    });

    if (!token?.sub) {
        return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const userKey = token.sub;

    const short = await enhanceLimiter.limit(userKey);
    if (!short.success) {
        const retryAfterSeconds = Math.max(
            Math.ceil((short.reset - Date.now()) / 1000),
            1
        );

        return NextResponse.json(
            {
                error: "Too many enhance requests. Try again later.",
                retryAfterSeconds,
            },
            {
                status: 429,
                headers: {
                    "Retry-After": String(retryAfterSeconds),
                    "X-RateLimit-Limit": "3/10m",
                    "X-RateLimit-Remaining": String(short.remaining),
                    "X-RateLimit-Reset": String(Math.floor(short.reset / 1000)),
                },
            }
        );
    }

    const daily = await enhanceDailyLimiter.limit(userKey);
    if (!daily.success) {
        const retryAfterSeconds = Math.max(
            Math.ceil((daily.reset - Date.now()) / 1000),
            1
        );

        return NextResponse.json(
            {
                error: "Daily enhance quota reached. Try again tomorrow.",
                retryAfterSeconds,
            },
            {
                status: 429,
                headers: {
                    "Retry-After": String(retryAfterSeconds),
                    "X-RateLimit-Limit": "20/day",
                    "X-RateLimit-Remaining": String(daily.remaining),
                    "X-RateLimit-Reset": String(Math.floor(daily.reset / 1000)),
                },
            }
        );
    }

    console.log(
        "API route '/api/s3/generate-enhance-url' was hit for user:",
        session.user?.username
    );

    try {
        const key = `analysis/${session.user.username}/${uuidv4()}-${filename}`;

        const { url, fields } = await createPresignedPost(s3Client, {
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

        return NextResponse.json(
            { url, fields, key },
            {
                headers: {
                    "X-Enhance-Remaining-Short": String(short.remaining),
                    "X-Enhance-Remaining-Daily": String(daily.remaining),
                },
            }
        );
    } catch (error) {
        console.error("Error creating presigned URL:", error);

        if (error instanceof Error) {
            return NextResponse.json({ error: error.message }, { status: 500 });
        }

        return NextResponse.json({ error: "Internal Server Error" }, { status: 500 });
    }
}
