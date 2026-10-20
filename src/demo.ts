// Demo client: connects over Streamable HTTP and calls every tool, printing the spoken reply.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { buildApp } from "./server.js";
const srv = buildApp().listen(0);
const port = (srv.address() as any).port;
const c = new Client({ name: "demo", version: "1" });
await c.connect(new StreamableHTTPClientTransport(new URL(`http://localhost:${port}/mcp`)));
console.log("Tools:", (await c.listTools()).tools.map((t) => t.name).join(", "));
const calls: [string, object][] = [
  ["check_business_compliance", { state: "Idaho", foreign: true, textsCustomers: true }],
  ["next_deadline", { state: "Idaho", anniversaryMonth: 10, today: "2026-10-20" }],
  ["next_deadline", { state: "New Mexico" }],
  ["explain_item", { item: "registered agent" }],
  ["check_business_compliance", { state: "Texas" }],
];
for (const [name, args] of calls) {
  const r: any = await c.callTool({ name, arguments: args as any });
  console.log(`> ${name} ${JSON.stringify(args)}\n  "${JSON.parse(r.content[0].text).speech}"`);
}
await c.close(); srv.close();
