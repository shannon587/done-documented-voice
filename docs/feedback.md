# Product feedback (draft)

**Tools used:**
- MCP TypeScript SDK 1.32.1: McpServer and StreamableHTTPServerTransport for the server, and Client with StreamableHTTPClientTransport for the agent and tests
- MCP Inspector
- **Amazon Bedrock Runtime (Converse API with tool use)** through `@aws-sdk/client-bedrock-runtime`, with Amazon Nova Lite as the default model

**What it was used for:** a self-hosted, stateless Streamable HTTP MCP server with four voice-oriented tools for the Alexa+ track, and a Bedrock-powered agent. The agent discovers those tools over MCP, plans multi-step goals with Converse tool use, and keeps per-business memory, all behind a push-to-talk web page that simulates an Alexa+ experience.

**AWS services:** Amazon Bedrock Converse (tool use) is the agent's planner. The `toolUse` and `toolResult` blocks map one-to-one onto MCP `tools/call`. Nova Lite through the `us.` inference profile keeps each spoken turn at a fraction of a cent.

**What worked well:**
- `registerTool` with zod schemas is concise.
- The stateless transport (`sessionIdGenerator: undefined`) took about 10 lines.
- The SDK client made end-to-end tests easy.
- The protocol version 2025-11-25 is the SDK default, so nothing needed configuring.

**What needs work:**
- There was no public, self-serve way to connect a self-hosted MCP server to a real Alexa+ device or simulator without Preview access, so the demo has to use a generic MCP client.
- Guidance on voice-specific output conventions is missing: how long a reply should be, and how Alexa+ chooses between text content and structured content.

**Onboarding:** quick for the MCP part, unclear for the Alexa+ hookup.

**Would we build with it again?** Yes, especially if Alexa+ offered a sandbox for testing MCP servers.
