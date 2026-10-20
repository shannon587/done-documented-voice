# Product feedback (draft)

**Tools used:** MCP TypeScript SDK 1.32.1 (McpServer, StreamableHTTPServerTransport, and the client for tests), plus MCP Inspector. No AWS services.

**What it was used for:** a self-hosted, stateless Streamable HTTP MCP server with four voice-oriented tools for the Alexa+ track.

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
