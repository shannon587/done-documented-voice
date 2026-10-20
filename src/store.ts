// Optional DynamoDB persistence for the Lambda deployment (free tier: 25 GB, 25 WCU/RCU).
// When DDB_TABLE is unset (local box), callers fall back to files and in-memory counters.
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";

const table = process.env.DDB_TABLE;
let client: DynamoDBClient | undefined;
const db = () => (client ??= new DynamoDBClient({ region: process.env.AWS_REGION ?? "us-east-1" }));
export const ddbEnabled = () => !!table;

export async function putFeedback(entry: Record<string, unknown>) {
  await db().send(new PutItemCommand({ TableName: table, Item: {
    pk: { S: "feedback" }, sk: { S: `${entry.at}#${Math.random().toString(36).slice(2, 8)}` },
    body: { S: JSON.stringify(entry) },
  } }));
}

// Atomic global daily counter so the cap holds across Lambda containers. Returns the new count.
export async function bumpDaily(day: string): Promise<number> {
  const r = await db().send(new UpdateItemCommand({ TableName: table, Key: { pk: { S: "usage" }, sk: { S: day } },
    UpdateExpression: "ADD n :one", ExpressionAttributeValues: { ":one": { N: "1" } }, ReturnValues: "UPDATED_NEW" }));
  return Number(r.Attributes?.n?.N ?? 0);
}
