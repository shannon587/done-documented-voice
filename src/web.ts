// One process: the MCP server at /mcp, the agent API at /api/chat, and the voice web page at /.
import express from "express";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { buildApp } from "./server.js";
import { Agent } from "./agent.js";
import { pickLLM, type LLM } from "./llm.js";
import { MemoryStore } from "./memory.js";
import { Guard, DEFAULT_GUARD, type GuardOpts } from "./guard.js";
import { appendFileSync, mkdirSync } from "node:fs";
import { ddbEnabled, putFeedback, bumpDaily } from "./store.js";
const DAILY_CAP = Number(process.env.DAILY_CAP ?? 1500);

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function buildWebApp(opts: { guard?: GuardOpts; feedbackFile?: string; llm?: LLM; memoryFile?: string; mcpUrl?: () => URL; today?: () => string } = {}) {
  const app = buildApp();
  const guard = new Guard(opts.guard ?? DEFAULT_GUARD);
  const feedbackFile = opts.feedbackFile ?? process.env.FEEDBACK_FILE ?? join(root, "data", "feedback.jsonl");
  // Behind the tunnel the real client IP arrives in cf-connecting-ip. The MCP endpoint stays private to the agent.
  const ipOf = (req: any) => String(req.headers["cf-connecting-ip"] ?? (String(req.headers["x-forwarded-for"] ?? "").split(",")[0].trim() || req.socket.remoteAddress || "?"));
  // IPv6 users get a whole /64, so rate-limit by the /64 prefix rather than the exact address.
  const ipKey = (req: any) => { const ip = ipOf(req); return ip.includes(":") ? ip.split(":").slice(0, 4).join(":") + "::/64" : ip; };
  const isPublic = (req: any) => !!(req.headers["cf-connecting-ip"] || req.headers["x-forwarded-for"]);
  const outer = express();
  outer.use(["/mcp", "/api/profile"], (req, res, next) => (isPublic(req) ? res.status(404).end() : next()));
  outer.use(app);
  const memory = new MemoryStore(opts.memoryFile ?? process.env.MEMORY_FILE ?? join(root, "data", "memory.json"));
  const llm = opts.llm ?? pickLLM();
  let agent: Agent | undefined;
  app.post("/api/chat", async (req, res) => {
    const text = String(req.body?.text ?? "").slice(0, 500).trim();
    const businessId = String(req.body?.businessId ?? "default").replace(/[^\w-]/g, "").slice(0, 64) || "default";
    if (!text) return res.status(400).json({ speech: "I didn't hear anything." });
    const g = guard.check(ipKey(req));
    if (!g.ok) return res.status(429).json({ speech: g.speech });
    if (ddbEnabled() && (await bumpDaily(new Date().toISOString().slice(0, 10))) > DAILY_CAP)
      return res.status(429).json({ speech: "The demo has reached its limit for today. Please try again tomorrow." });
    agent ??= new Agent(llm, opts.mcpUrl?.() ?? new URL(`http://127.0.0.1:${(req.socket.localPort)}/mcp`), memory, opts.today);
    memory.seed(businessId, req.body?.profile);
    try { const r = await agent.chat(businessId, text); res.json({ ...r, profile: memory.get(businessId) }); }
    catch (e: any) { console.error(e); res.status(500).json({ speech: "Something went wrong on my end. Please try again.", error: String(e?.name ?? e) }); }
  });
  app.post("/api/feedback", async (req, res) => {
    const b = req.body ?? {};
    const text = String(b.text ?? "").slice(0, 2000).trim();
    if (!text) return res.status(400).json({ ok: false, speech: "Please say or type your feedback first." });
    const g = guard.check("fb:" + ipKey(req));
    if (!g.ok) return res.status(429).json({ ok: false, speech: g.speech });
    const rating = Number.isInteger(b.rating) && b.rating >= 1 && b.rating <= 5 ? b.rating : undefined;
    const entry = { at: new Date().toISOString(), rating, text, usesScreenReader: b.usesScreenReader === true ? true : undefined, device: String(b.device ?? "").slice(0, 40) || undefined };
    if (process.env.FEEDBACK_LOG === "1") console.log("DD_FEEDBACK " + JSON.stringify(entry)); // durable in CloudWatch Logs
    if (ddbEnabled()) await putFeedback(entry);
    else if (process.env.FEEDBACK_LOG !== "1") { mkdirSync(dirname(feedbackFile), { recursive: true }); appendFileSync(feedbackFile, JSON.stringify(entry) + "\n"); }
    res.json({ ok: true, speech: "Thank you. Your feedback was saved anonymously." });
  });
  app.get("/api/profile/:id", (req, res) => res.json(memory.get(req.params.id)));
  app.get("/api/mode", (_q, r) => r.json({ model: llm.name, usage: guard.stats() }));
  app.use(express.static(join(root, "public")));
  return outer;
}

if (process.argv[1]?.endsWith("web.ts") || process.argv[1]?.endsWith("web.js") || process.argv[1]?.endsWith("web.mjs")) {
  const port = Number(process.env.PORT ?? 3000);
  const app = buildWebApp();
  app.listen(port, process.env.HOST ?? "127.0.0.1", () => console.log(`Done + Documented Voice: http://localhost:${port}  (MCP at /mcp, model ${pickLLM().name})`));
}
