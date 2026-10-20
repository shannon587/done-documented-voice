# Deploy to AWS Lambda + Function URL (free tier)

1. In the AWS console (root or an admin), attach `deployer-policy.json` as an inline policy to IAM user `dd-voice-bedrock`.
2. On the box: load the keys from the secrets file (never print them), then
   `BUDGET_EMAIL=<owner email> ./deploy/lambda/deploy.sh`
3. The script prints the public Function URL.

Free-tier fit: Lambda 1M requests + 400k GB-s per month; DynamoDB 25 GB + 25 RCU/WCU (table uses 2/2).
Only Bedrock Nova Lite calls cost money (fractions of a cent each), capped by the app's daily limit and the $5 budget alert.
Note: business memory lives in /tmp per Lambda container (fine for short tester sessions); feedback and the daily cap are in DynamoDB.
