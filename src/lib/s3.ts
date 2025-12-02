import "server-only";
import { S3Client } from "@aws-sdk/client-s3";

const credentials = {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
};

export const s3Client = new S3Client({
    region: process.env.APP_AWS_REGION,
    credentials,
});