# Done + Documented Voice

**A voice-first compliance agent for small businesses, from Done + Documented. It's built on a self-hosted MCP server for Alexa+, and an Amazon Bedrock agent plans and calls its tools.**

## Why it exists
Founder Shannon Watson is legally blind and runs small businesses in Idaho and New Mexico. State compliance sites are walls of dense text and PDFs, and screen readers make them slower still. Done + Documented Voice is for business owners who'd rather listen than read. It gives one short answer at a time: what is due, what it costs, and what a word means.

## How it works
```
Browser (push-to-talk)  ──speech-to-text──▶  POST /api/chat
                                               │
                               Agent (src/agent.ts) ◀──▶ Amazon Bedrock Converse API (tool use)
                                               │            (or MockLLM when no AWS credentials)
                         MCP client, Streamable HTTP
                                               ▼
                         MCP server  POST /mcp  (spec 2025-11-25, src/server.ts)
                                               │
                         Per-business memory: data/memory.json (src/memory.ts)
Reply text ──▶ browser speechSynthesis (spoken) + aria-live region (screen readers)
```
- **Agent loop:** the LLM gets the MCP server's tool list, discovered live with `listTools`, plus five memory tools. It runs up to 6 tool-use steps per request.
  - Example: "Get me compliant in Idaho. We're an out-of-state LLC formed in October." The agent runs save_business_profile, then check_business_compliance, then next_deadline, and gives one spoken answer.
- **Memory across sessions:** state, foreign status, anniversary month, website, the saved checklist, a cursor and done items are kept per business.
  - "Next", "repeat" and "that's done" work days later, after a restart.
  - Missing tool arguments are filled from memory.
- **Voice web page** (`public/index.html`):
  - one large push-to-talk button (hold with a mouse, touch or the space bar)
  - the Web Speech API for input, `speechSynthesis` for output
  - Next, Repeat and Stop buttons, plus a typed fallback
  - black and yellow high contrast, 1.6rem and larger text, visible focus rings, and `aria-live` replies
- **Mock LLM mode:** with no AWS credentials, or `LLM_MODE=mock`, a deterministic rule-based planner emits the same Converse-shaped tool calls. Everything runs and every test passes offline.

## Design rules
- Every reply is short enough to say out loud. Details come one at a time ("Say next for more").
- **No invented facts.** Every fee and rule in `src/data.ts` cites a statute or official source. Anything not verified is labeled *unknown*, and unsupported states say so. The agent's system prompt forbids stating anything a tool didn't return.
- Data verified Oct 20, 2026. Laws change, so confirm with the state before filing. This is not legal advice.

## Tools
| Tool | What it does |
|---|---|
| `check_business_compliance` | Gives a checklist for an Idaho or New Mexico LLC covering formation or foreign registration, registered agent, annual report, and optionally EIN, SMS consent and website accessibility. |
| `next_deadline` | Gives the next state filing deadline in one sentence. For example, the Idaho annual report is due at the end of the anniversary month (Idaho Code 30-21-213), and New Mexico LLCs have none. |
| `explain_item` | Explains a term like "registered agent" or "A2P" in two plain sentences. |
| `accessibility_quick_check` | Fetches a URL and reports missing alt text, unlabeled form fields, heading problems and a missing page language. |

## Tech
- TypeScript on Node 20, Express and zod
- `@modelcontextprotocol/sdk` **1.32.1** (`LATEST_PROTOCOL_VERSION` = `2025-11-25`)
  - Server: `StreamableHTTPServerTransport` in stateless mode at `POST /mcp`
  - Agent: `Client` + `StreamableHTTPClientTransport`
- `@aws-sdk/client-bedrock-runtime`: `ConverseCommand` with `toolConfig` (src/llm.ts)
- Tests use `node:test` through tsx: 14 tests, including an end-to-end MCP test, a multi-step agent run, memory across a restart, and the Bedrock request shape.

## Run
```bash
npm install
npm start          # web app + agent + MCP: open http://localhost:3000  (MCP at http://localhost:3000/mcp)
npm test
npm run mcp        # MCP server only
npm run demo       # calls every MCP tool and prints the spoken replies
npx @modelcontextprotocol/inspector   # optional: connect to http://localhost:3000/mcp (Streamable HTTP)
```
Voice input needs Chrome or Edge (Web Speech API). Other browsers fall back to the typed box.

### Using Amazon Bedrock
Without credentials the app runs in mock mode, and the page shows "Model: mock".
To use Bedrock, set these environment variables before `npm start`:
```bash
export AWS_ACCESS_KEY_ID=...  AWS_SECRET_ACCESS_KEY=...  AWS_REGION=us-east-1
# optional
export BEDROCK_MODEL_ID=us.amazon.nova-lite-v1:0   # default; e.g. us.anthropic.claude-haiku-4-5-20251001-v1:0
export LLM_MODE=bedrock                             # force Bedrock (auto is the default; mock forces mock)
```
Least-privilege IAM policy:
```json
{ "Version": "2012-10-17", "Statement": [{ "Effect": "Allow",
  "Action": ["bedrock:InvokeModel", "bedrock:InvokeModelWithResponseStream"],
  "Resource": ["arn:aws:bedrock:*::foundation-model/amazon.nova-lite-v1:0",
               "arn:aws:bedrock:*:*:inference-profile/us.amazon.nova-lite-v1:0"] }] }
```

## AWS Builder (mini challenge)
- **Amazon Bedrock Converse API with tool use** is the agent's reasoning engine (`src/llm.ts`, `BedrockLLM`).
  - It receives the MCP tool schemas as `toolSpec`s.
  - It returns `toolUse` blocks, which the agent executes against the MCP server and returns as `toolResult` blocks.
- **Default model:** Amazon Nova Lite through the US cross-region inference profile. It's chosen for low cost and low latency on short spoken turns.
- **Cost:** a typical request is about 1–3 Converse calls at roughly 2k input tokens, which is a fraction of a cent.

## Sources
- Idaho Code 30-21-213 (annual report): https://legislature.idaho.gov/statutesrules/idstat/title30/t30ch21/sect30-21-213/
- Idaho SOS FAQ (foreign registration): https://sos.idaho.gov/business-resources/business-faq/
- NMSA 53-19-63 (NM LLC fees): https://law.justia.com/codes/new-mexico/chapter-53/article-19/section-53-19-63/
- 12.3.4.11 NMAC (NM LLC filings): https://www.law.cornell.edu/regulations/new-mexico/N-M-Admin-Code-SS-12.3.4.11

## Hackathon
Built for the Amazon Developer Hackathon 2026: the Alexa+ track (self-hosted MCP server, plus a simulated Alexa+ voice experience driven by a Bedrock agent) and the AWS Builder mini challenge. Everything was created during the submission window.

## License
MIT
