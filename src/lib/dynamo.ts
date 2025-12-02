import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const credentials = {
    accessKeyId: process.env.APP_AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.APP_AWS_SECRET_ACCESS_KEY!,
};

export const ddbDocClient = DynamoDBDocumentClient.from(new DynamoDBClient({
    region: process.env.APP_AWS_REGION,
    credentials,
}), { marshallOptions: { removeUndefinedValues: true } });
