import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildWebApp } from "../src/web.js";
import { MockLLM, BedrockLLM } from "../src/llm.js";
import { MemoryStore } from "../src/memory.js";

const stop = (s: any) => { s.closeAllConnections(); s.close(); };
function start(memoryFile = join(mkdtempSync(join(tmpdir(), "dd-")), "m.json")) {
  const srv = buildWebApp({ llm: new MockLLM(), memoryFile, today: () => "2026-10-20" }).listen(0);
  const base = `http://127.0.0.1:${(srv.address() as any).port}`;
  const say = async (text: string, businessId = "acme") =>
    (await fetch(base + "/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ text, businessId }) })).json() as Promise<any>;
  return { srv, say, memoryFile, base };
}

test("multi-step goal: agent saves profile, checks compliance and deadline over MCP", async () => {
  const { srv, say } = start();
  const r = await say("Get me compliant in Idaho. We're an out-of-state LLC formed in October and we text customers.");
  assert.deepEqual(r.steps.map((s: any) => s.tool), ["save_business_profile", "check_business_compliance", "next_deadline"]);
  assert.equal(r.steps[1].input.foreign, true);
  assert.match(r.speech, /Foreign registration/);
  assert.match(r.speech, /October 31, 2026/);
  stop(srv);
});

test("memory persists across sessions and server restarts", async () => {
  const a = start();
  await a.say("Get me compliant in Idaho, out-of-state LLC formed in October.");
  stop(a.srv);
  const b = start(a.memoryFile); // new process, same store
  const n1 = await b.say("next");
  assert.match(n1.speech, /Item 2 of 3: Registered agent/);
  const d = await b.say("When is my deadline?");
  assert.equal(d.steps[0].input.state, "Idaho");
  assert.equal(d.steps[0].input.anniversaryMonth, 10);
  const rep = await b.say("repeat");
  assert.equal(rep.speech, d.speech);
  const other = await b.say("next", "other-biz");
  assert.match(other.speech, /no checklist/i);
  stop(b.srv);
});

test("unknown state stays unknown and explain works", async () => {
  const { srv, say } = start();
  assert.match((await say("What do I need in Texas?")).speech, /unknown/);
  assert.match((await say("What is a registered agent?")).speech, /legal papers/);
  stop(srv);
});

test("BedrockLLM builds a Converse request with tool specs", async () => {
  let sent: any;
  const fake = { send: async (c: any) => { sent = c.input; return { stopReason: "end_turn", output: { message: { role: "assistant", content: [{ text: "Hi" }] } }, usage: {} }; } };
  const llm = new BedrockLLM(fake, "us.amazon.nova-lite-v1:0");
  const t = await llm.converse("sys", [{ role: "user", content: [{ text: "hello" }] }], [{ name: "x", description: "d", inputSchema: { type: "object", properties: {} } }]);
  assert.equal(t.message.content[0] && "text" in t.message.content[0] && t.message.content[0].text, "Hi");
  assert.equal(sent.modelId, "us.amazon.nova-lite-v1:0");
  assert.deepEqual(sent.toolConfig.tools[0].toolSpec.inputSchema, { json: { type: "object", properties: {} } });
  assert.equal(sent.system[0].text, "sys");
});

test("memory store forget", () => {
  const m = new MemoryStore(join(mkdtempSync(join(tmpdir(), "dd-")), "m.json"));
  m.update("a", { state: "Idaho" }); assert.equal(m.get("a").state, "Idaho");
  m.forget("a"); assert.equal(m.get("a").state, undefined);
});
