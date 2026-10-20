// One process: the MCP server at /mcp, the agent API at /api/chat, and the voice web page at /.
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "./server.js";
import { Agent } from "./agent.js";
import { pickLLM, type LLM } from "./llm.js";
import { MemoryStore } from "./memory.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildWebApp(opts: { llm?: LLM; memoryFile?: string; mcpUrl?: () => URL; today?: () => string } = {}) {
  const app = buildApp();
  const memory = new MemoryStore(opts.memoryFile ?? process.env.MEMORY_FILE ?? join(root, "data", "memory.json"));
  const llm = opts.llm ?? pickLLM();
  let agent: Agent | undefined;
  app.post("/api/chat", async (req, res) => {
    const text = String(req.body?.text ?? "").slice(0, 500).trim();
    const businessId = String(req.body?.businessId ?? "default").replace(/[^\w-]/g, "").slice(0, 64) || "default";
    if (!text) return res.status(400).json({ speech: "I didn't hear anything." });
    agent ??= new Agent(llm, opts.mcpUrl?.() ?? new URL(`http://127.0.0.1:${(req.socket.localPort)}/mcp`), memory, opts.today);
    try { res.json(await agent.chat(businessId, text)); }
    catch (e: any) { console.error(e); res.status(500).json({ speech: "Something went wrong on my end. Please try again.", error: String(e?.name ?? e) }); }
  });
  app.get("/api/profile/:id", (req, res) => res.json(memory.get(req.params.id)));
  app.get("/api/mode", (_q, r) => r.json({ model: llm.name }));
  app.use(express.static(join(root, "public")));
  return app;
}

if (process.argv[1]?.endsWith("web.ts") || process.argv[1]?.endsWith("web.js")) {
  const port = Number(process.env.PORT ?? 3000);
  const app = buildWebApp();
  app.listen(port, () => console.log(`Done + Documented Voice: http://localhost:${port}  (MCP at /mcp, model ${pickLLM().name})`));
}
