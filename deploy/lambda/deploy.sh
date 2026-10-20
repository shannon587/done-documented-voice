#!/usr/bin/env bash
# One-time deploy of Done + Documented Voice to AWS Lambda + Function URL (free tier).
# Needs IAM permissions in deploy/lambda/deployer-policy.json. Never commit credentials.
# Cost guards: 30 s timeout, 512 MB, per-IP rate limit + global DynamoDB daily cap in the app,
# 300-token replies, DynamoDB on-demand (free-tier sized), $5 budget alert.
set -euo pipefail
R=${AWS_REGION:-us-east-1}; ACCT=$(aws sts get-caller-identity --query Account --output text)
FN=dd-voice; ROLE=dd-voice-lambda; TABLE=dd-voice; EMAIL=${BUDGET_EMAIL:?set BUDGET_EMAIL for the budget alert}
LAYER=arn:aws:lambda:$R:753240598075:layer:LambdaAdapterLayerX86:25
cd "$(dirname "$0")"; ./build.sh

USE_DDB=${USE_DDB:-1}
[ "$USE_DDB" = 1 ] && { aws dynamodb describe-table --table-name $TABLE --region $R >/dev/null 2>&1 || \
  aws dynamodb create-table --table-name $TABLE --region $R --billing-mode PROVISIONED \
    --provisioned-throughput ReadCapacityUnits=2,WriteCapacityUnits=2 \
    --attribute-definitions AttributeName=pk,AttributeType=S AttributeName=sk,AttributeType=S \
    --key-schema AttributeName=pk,KeyType=HASH AttributeName=sk,KeyType=RANGE >/dev/null; }

if ! aws iam get-role --role-name $ROLE >/dev/null 2>&1; then
  aws iam create-role --role-name $ROLE --assume-role-policy-document file://trust.json >/dev/null
  aws iam attach-role-policy --role-name $ROLE --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole
  sed "s/ACCOUNT/$ACCT/g; s/REGION/$R/g" runtime-policy.json > /tmp/rp.json
  aws iam put-role-policy --role-name $ROLE --policy-name dd-voice-runtime --policy-document file:///tmp/rp.json
  sleep 10
fi
DDBV=""; [ "$USE_DDB" = 1 ] && DDBV="DDB_TABLE=$TABLE,"
ENV="Variables={AWS_LWA_PORT=8080,PORT=8080,MEMORY_FILE=/tmp/memory.json,${DDBV}FEEDBACK_LOG=1,DAILY_CAP=1500,RATE_PER_MIN=8,RATE_PER_IP_DAY=120,MAX_TOKENS=300,LLM_MODE=bedrock,AWS_LAMBDA_EXEC_WRAPPER=/opt/bootstrap}"
if aws lambda get-function --function-name $FN --region $R >/dev/null 2>&1; then
  aws lambda update-function-code --function-name $FN --zip-file fileb://function.zip --region $R >/dev/null
else
  aws lambda create-function --function-name $FN --region $R --runtime nodejs20.x --architectures x86_64 \
    --role arn:aws:iam::$ACCT:role/$ROLE --handler run.sh --zip-file fileb://function.zip \
    --timeout 30 --memory-size 512 --layers $LAYER --environment "$ENV" >/dev/null
  aws lambda wait function-active --function-name $FN --region $R
  # Without DynamoDB, one warm container keeps the in-memory daily cap meaningful.
  [ "$USE_DDB" = 1 ] || aws lambda put-function-concurrency --function-name $FN --region $R --reserved-concurrent-executions 1 >/dev/null 2>&1 || echo "reserved concurrency not allowed on this account"
  aws lambda create-function-url-config --function-name $FN --region $R --auth-type NONE >/dev/null
  aws lambda add-permission --function-name $FN --region $R --statement-id public-url \
    --action lambda:InvokeFunctionUrl --principal '*' --function-url-auth-type NONE >/dev/null
  aws lambda add-permission --function-name $FN --region $R --statement-id public-invoke \
    --action lambda:InvokeFunction --principal "*" --invoked-via-function-url >/dev/null
fi
sed "s/__EMAIL__/$EMAIL/g" budget-notify.json > /tmp/bn.json
aws budgets create-budget --account-id $ACCT --budget file://budget.json --notifications-with-subscribers file:///tmp/bn.json 2>&1 | tail -1 || true
aws lambda get-function-url-config --function-name $FN --region $R --query FunctionUrl --output text
