import { test } from "node:test";
import assert from "node:assert/strict";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "../src/server.js";

test("MCP over Streamable HTTP lists and calls tools (protocol 2025-11-25)", async () => {
  const srv = buildApp().listen(0);
  const port = (srv.address() as any).port;
  const client = new Client({ name: "test", version: "1" });
  const tr = new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`));
  await client.connect(tr);
  assert.equal(tr.protocolVersion ?? "2025-11-25", "2025-11-25");
  const names = (await client.listTools()).tools.map((t) => t.name).sort();
  assert.deepEqual(names, ["accessibility_quick_check", "check_business_compliance", "explain_item", "next_deadline"]);
  const r: any = await client.callTool({ name: "next_deadline", arguments: { state: "New Mexico" } });
  assert.match(JSON.parse(r.content[0].text).speech, /no annual report/i);
  await client.close(); srv.close();
});
