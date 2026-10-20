// The Done + Documented Voice agent: an LLM (Bedrock Converse, or the mock) plans the steps,
// calls our MCP server's tools over Streamable HTTP as an MCP client, and keeps per-business memory.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import type { LLM, Message, ToolSpec, Block } from "./llm.js";
import { MemoryStore, type Profile } from "./memory.js";

const MAX_STEPS = 6;

export const SYSTEM = (p: Profile, today: string) => `You are Done + Documented Voice, a voice-first small business compliance assistant.
Your replies are spoken aloud to owners who may be blind or low-vision. Rules:
- Reply in one to three short sentences. Plain words, no lists, no markdown, no URLs read aloud.
- Give one item at a time. Offer "say next" when more remain.
- Only state fees, rules and deadlines that come back from tools. If a tool says unknown, say it's unknown. Never guess.
- For a goal like "get me compliant", save what you learn with save_business_profile, run check_business_compliance, then next_deadline, then answer with the first item.
- For "next" use next_checklist_item. For "repeat" use repeat_last. When the owner says an item is done, use mark_item_done.
- This is information, not legal advice.
Today is ${today}. Known business profile (from earlier sessions): ${JSON.stringify(strip(p))}`;
const strip = (p: Profile) => { const { checklist, lastSpeech, ...rest } = p; return { ...rest, checklistItems: checklist?.map((c) => c.item) }; };

const LOCAL_TOOLS: ToolSpec[] = [
  { name: "save_business_profile", description: "Remember facts about this business across sessions.", inputSchema: { type: "object", properties: {
    name: { type: "string" }, state: { type: "string" }, foreign: { type: "boolean", description: "Formed in another state" },
    anniversaryMonth: { type: "integer", minimum: 1, maximum: 12 }, hasEmployees: { type: "boolean" }, textsCustomers: { type: "boolean" }, website: { type: "string" } } } },
  { name: "next_checklist_item", description: "Speak the next item on the saved compliance checklist.", inputSchema: { type: "object", properties: {} } },
  { name: "repeat_last", description: "Repeat the last spoken answer.", inputSchema: { type: "object", properties: {} } },
  { name: "mark_item_done", description: "Mark the current checklist item as done.", inputSchema: { type: "object", properties: { item: { type: "string" } } } },
  { name: "forget_business", description: "Delete everything remembered about this business.", inputSchema: { type: "object", properties: {} } },
];

export type AgentReply = { speech: string; steps: { tool: string; input: any }[]; model: string };

export class Agent {
  constructor(private llm: LLM, private mcpUrl: URL, private memory: MemoryStore, private today = () => new Date().toISOString().slice(0, 10)) {}

  async chat(businessId: string, userText: string): Promise<AgentReply> {
    const client = new Client({ name: "dd-voice-agent", version: "1.0.0" });
    await client.connect(new StreamableHTTPClientTransport(this.mcpUrl));
    try {
      const mcpTools: ToolSpec[] = (await client.listTools()).tools.map((t) => ({ name: t.name, description: t.description ?? "", inputSchema: t.inputSchema }));
      const tools = [...mcpTools, ...LOCAL_TOOLS];
      const mcpNames = new Set(mcpTools.map((t) => t.name));
      const messages: Message[] = [{ role: "user", content: [{ text: userText }] }];
      const steps: AgentReply["steps"] = [];
      for (let i = 0; i < MAX_STEPS; i++) {
        const turn = await this.llm.converse(SYSTEM(this.memory.get(businessId), this.today()), messages, tools);
        messages.push(turn.message);
        const uses = turn.message.content.filter((b): b is Extract<Block, { toolUse: any }> => "toolUse" in b);
        if (turn.stopReason !== "tool_use" || !uses.length) {
          const speech = turn.message.content.filter((b): b is { text: string } => "text" in b).map((b) => b.text).join(" ").trim() || "Sorry, I didn't catch that.";
          this.memory.update(businessId, { lastSpeech: speech });
          return { speech, steps, model: this.llm.name };
        }
        const results: Block[] = [];
        for (const u of uses) {
          const { name, toolUseId } = u.toolUse; const input = this.fill(businessId, name, u.toolUse.input ?? {});
          steps.push({ tool: name, input });
          let json: any;
          try {
            json = mcpNames.has(name) ? await this.callMcp(client, name, input) : this.local(businessId, name, input);
            if (name === "check_business_compliance" && json.items?.length) this.memory.update(businessId, { checklist: json.items, cursor: 0 });
            results.push({ toolResult: { toolUseId, content: [{ json }] } });
          } catch (e: any) {
            results.push({ toolResult: { toolUseId, content: [{ text: `Error: ${e?.message ?? e}` }], status: "error" } });
          }
        }
        messages.push({ role: "user", content: results });
      }
      return { speech: "That took too many steps. Try a shorter question.", steps, model: this.llm.name };
    } finally { await client.close(); }
  }

  // Fill missing arguments from memory so a returning owner doesn't have to repeat themselves.
  private fill(id: string, name: string, input: any) {
    const p = this.memory.get(id); const x = { ...input };
    if (["check_business_compliance", "next_deadline"].includes(name)) {
      if (!x.state || x.state === "__profile__") x.state = p.state ?? "unknown";
      if (name === "check_business_compliance") {
        for (const k of ["foreign", "hasEmployees", "textsCustomers"] as const) if (x[k] === undefined && p[k] !== undefined) x[k] = p[k];
        if (x.hasWebsite === undefined && p.website) x.hasWebsite = true;
      }
      if (name === "next_deadline") { if (!x.anniversaryMonth && p.anniversaryMonth) x.anniversaryMonth = p.anniversaryMonth; x.today ??= this.today(); }
    }
    if (name === "accessibility_quick_check" && (!x.url || x.url === "__profile__")) x.url = p.website ?? "";
    return x;
  }

  private async callMcp(client: Client, name: string, args: any) {
    const r: any = await client.callTool({ name, arguments: args });
    const t = r.content?.find((c: any) => c.type === "text")?.text ?? "{}";
    return JSON.parse(t);
  }

  private local(id: string, name: string, input: any): any {
    const m = this.memory; const p = m.get(id);
    switch (name) {
      case "save_business_profile": return { speech: "Saved.", profile: strip(m.update(id, input)) };
      case "repeat_last": return { speech: p.lastSpeech ?? "Nothing to repeat yet." };
      case "forget_business": m.forget(id); return { speech: "Okay, I've forgotten this business." };
      case "next_checklist_item": {
        const list = p.checklist ?? [];
        if (!list.length) return { speech: "There's no checklist yet. Ask what your business needs first." };
        const i = (p.cursor ?? 0) + 1;
        if (i >= list.length) return { speech: "That's the whole checklist. Nice work." };
        m.update(id, { cursor: i }); const it = list[i];
        return { speech: `Item ${i + 1} of ${list.length}: ${it.item}. ${it.text}${it.fee ? " Fee: " + it.fee : ""}${i + 1 < list.length ? " Say next for more." : ""}`, source: it.source };
      }
      case "mark_item_done": {
        const list = p.checklist ?? []; const it = input.item ?? list[p.cursor ?? 0]?.item;
        if (!it) return { speech: "Nothing to mark done yet." };
        m.update(id, { done: [...new Set([...(p.done ?? []), it])] });
        return { speech: `Marked ${it} done.` };
      }
    }
    throw new Error(`Unknown tool ${name}`);
  }
}
