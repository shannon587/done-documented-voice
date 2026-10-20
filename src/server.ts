import express from "express";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { LATEST_PROTOCOL_VERSION } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import * as T from "./tools.js";

const out = (r: object) => ({ content: [{ type: "text" as const, text: JSON.stringify(r) }] });

export function buildServer() {
  const s = new McpServer({ name: "done-documented-voice", version: "0.1.0" });
  s.registerTool("check_business_compliance", {
    description: "Short, voice-friendly compliance checklist for an LLC in Idaho or New Mexico, with sources.",
    inputSchema: { state: z.string(), foreign: z.boolean().optional(), hasEmployees: z.boolean().optional(), textsCustomers: z.boolean().optional(), hasWebsite: z.boolean().optional() },
  }, async (a) => out(T.checkCompliance(a)));
  s.registerTool("next_deadline", {
    description: "The next state filing deadline in one sentence.",
    inputSchema: { state: z.string(), anniversaryMonth: z.number().int().min(1).max(12).optional(), today: z.string().optional() },
  }, async (a) => out(T.nextDeadline(a)));
  s.registerTool("explain_item", {
    description: "Explain a compliance term in two short sentences.",
    inputSchema: { item: z.string() },
  }, async (a) => out(T.explainItem(a)));
  s.registerTool("accessibility_quick_check", {
    description: "Check a web page for basic accessibility issues and speak the results.",
    inputSchema: { url: z.string() },
  }, async (a) => out(await T.accessibilityQuickCheck(a)));
  return s;
}

export function buildApp() {
  const app = express();
  app.use(express.json());
  // Stateless Streamable HTTP: a fresh server + transport per request.
  app.post("/mcp", async (req, res) => {
    const server = buildServer();
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined });
    res.on("close", () => { transport.close(); server.close(); });
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  });
  app.get("/health", (_q, r) => r.json({ ok: true, protocol: LATEST_PROTOCOL_VERSION }));
  return app;
}

if (process.argv[1]?.endsWith("server.ts") || process.argv[1]?.endsWith("server.js")) {
  const port = Number(process.env.PORT ?? 3000);
  buildApp().listen(port, () => console.log(`Done + Documented Voice MCP on http://localhost:${port}/mcp (protocol ${LATEST_PROTOCOL_VERSION})`));
}
